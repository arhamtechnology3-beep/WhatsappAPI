-- Visitor recognition + WhatsApp recovery (in-house)
-- Extends IdentityFlow visitor tables for first-party identification,
-- tagged WhatsApp links (wcid), unlock-on-WhatsApp capture, and
-- consent-safe browse/cart/visit nudges.

-- ------------------------------------------------------------
-- visitor_identity_map: contact link + source + activity
-- ------------------------------------------------------------
ALTER TABLE visitor_identity_map
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IS NULL OR source IN (
      'order', 'customer_login', 'wa_link', 'wa_click', 'popup', 'checkout', 'capture'
    )),
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_store_visitor
  ON visitor_identity_map (store_id, visitor_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_contact
  ON visitor_identity_map (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_store_phone
  ON visitor_identity_map (store_id, phone_number)
  WHERE store_id IS NOT NULL;

-- ------------------------------------------------------------
-- contact_link_tokens: short wcid for tagged WhatsApp CTAs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_contact_link_tokens_contact
  ON contact_link_tokens (contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_link_tokens_expires
  ON contact_link_tokens (expires_at);

ALTER TABLE contact_link_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_link_tokens_select ON contact_link_tokens;
CREATE POLICY contact_link_tokens_select ON contact_link_tokens
  FOR SELECT USING (is_store_member(store_id));

-- ------------------------------------------------------------
-- visitor_capture_settings: popup + nudge caps per store
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitor_capture_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  popup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  popup_delay_seconds INTEGER NOT NULL DEFAULT 25
    CHECK (popup_delay_seconds >= 0 AND popup_delay_seconds <= 600),
  offer_text TEXT NOT NULL DEFAULT 'Unlock 10% OFF on WhatsApp',
  discount_code TEXT NOT NULL DEFAULT 'DP10',
  whatsapp_number TEXT,
  policy_version TEXT NOT NULL DEFAULT 'v1',
  browse_nudge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cart_nudge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  visit_nudge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_marketing_per_24h INTEGER NOT NULL DEFAULT 1
    CHECK (max_marketing_per_24h >= 0 AND max_marketing_per_24h <= 10),
  browse_visit_cooldown_days INTEGER NOT NULL DEFAULT 7
    CHECK (browse_visit_cooldown_days >= 0 AND browse_visit_cooldown_days <= 90),
  skip_recent_buyer_days INTEGER NOT NULL DEFAULT 3
    CHECK (skip_recent_buyer_days >= 0 AND skip_recent_buyer_days <= 90),
  inactivity_min_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (inactivity_min_minutes >= 5 AND inactivity_min_minutes <= 1440),
  inactivity_max_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (inactivity_max_minutes >= 10 AND inactivity_max_minutes <= 2880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visitor_capture_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visitor_capture_settings_select ON visitor_capture_settings;
DROP POLICY IF EXISTS visitor_capture_settings_write ON visitor_capture_settings;
CREATE POLICY visitor_capture_settings_select ON visitor_capture_settings
  FOR SELECT USING (is_store_member(store_id));
CREATE POLICY visitor_capture_settings_write ON visitor_capture_settings
  FOR ALL USING (is_store_member(store_id, 'admin'))
  WITH CHECK (is_store_member(store_id, 'admin'));

-- ------------------------------------------------------------
-- wa_unlock_requests: OTP-free "unlock offer on WhatsApp" refs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_unlock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  UNIQUE (ref_code)
);

CREATE INDEX IF NOT EXISTS idx_wa_unlock_requests_visitor
  ON wa_unlock_requests (store_id, visitor_id);

CREATE INDEX IF NOT EXISTS idx_wa_unlock_requests_expires
  ON wa_unlock_requests (expires_at)
  WHERE claimed_at IS NULL;

ALTER TABLE wa_unlock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_unlock_requests_select ON wa_unlock_requests;
CREATE POLICY wa_unlock_requests_select ON wa_unlock_requests
  FOR SELECT USING (is_store_member(store_id));

-- ------------------------------------------------------------
-- visitor_nudge_log: frequency caps across nudge types
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitor_nudge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  visitor_id TEXT,
  nudge_type TEXT NOT NULL
    CHECK (nudge_type IN ('cart', 'browse', 'visit')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_visitor_nudge_log_contact_sent
  ON visitor_nudge_log (contact_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_nudge_log_store_sent
  ON visitor_nudge_log (store_id, sent_at DESC);

ALTER TABLE visitor_nudge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visitor_nudge_log_select ON visitor_nudge_log;
CREATE POLICY visitor_nudge_log_select ON visitor_nudge_log
  FOR SELECT USING (is_store_member(store_id));

-- ------------------------------------------------------------
-- tracking_events: stronger visitor lookup index
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tracking_events_store_visitor_occurred
  ON tracking_events (store_id, visitor_id, occurred_at DESC);

-- ------------------------------------------------------------
-- visitor_sessions: ensure store_id / organization_id exist
-- ------------------------------------------------------------
ALTER TABLE visitor_sessions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_store_activity
  ON visitor_sessions (store_id, last_activity_at DESC NULLS LAST)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_store_visitor
  ON visitor_sessions (store_id, visitor_id)
  WHERE store_id IS NOT NULL;
