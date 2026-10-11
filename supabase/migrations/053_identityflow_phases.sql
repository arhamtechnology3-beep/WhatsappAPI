-- ============================================================
-- 053_identityflow_phases.sql
-- Phase 1–5 schema: webhook receipts, GDPR jobs, tracking events,
-- customer profiles, campaigns, segments, usage, support access,
-- retention markers. Idempotent.
-- ============================================================

-- Webhook receipt / idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  shop_domain TEXT,
  topic TEXT NOT NULL,
  webhook_id TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'dead_letter')),
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_webhook_id
  ON webhook_events (webhook_id)
  WHERE webhook_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_store ON webhook_events (store_id, created_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_events_select ON webhook_events;
CREATE POLICY webhook_events_select ON webhook_events
  FOR SELECT USING (
    organization_id IS NOT NULL AND is_workspace_member(organization_id, 'admin')
  );

-- GDPR / privacy jobs
CREATE TABLE IF NOT EXISTS privacy_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  shop_domain TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'customers_data_request',
    'customers_redact',
    'shop_redact'
  )),
  shopify_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_privacy_jobs_status ON privacy_jobs (status, created_at);

ALTER TABLE privacy_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_jobs_select ON privacy_jobs;
CREATE POLICY privacy_jobs_select ON privacy_jobs
  FOR SELECT USING (
    organization_id IS NOT NULL AND is_workspace_member(organization_id, 'admin')
  );

-- Tracking events (store-scoped)
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  visitor_id TEXT,
  session_id TEXT,
  customer_profile_id UUID,
  consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_store_occurred
  ON tracking_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_visitor
  ON tracking_events (store_id, visitor_id);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_events_select ON tracking_events;
CREATE POLICY tracking_events_select ON tracking_events
  FOR SELECT USING (is_store_member(store_id));

-- Customer profiles (Customer 360, store-scoped)
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shopify_customer_id TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  email_hash TEXT,
  phone_hash TEXT,
  display_name TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'denied', 'withdrawn')),
  order_count INTEGER NOT NULL DEFAULT 0,
  lifetime_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  communication_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_shopify
  ON customer_profiles (store_id, shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_profiles_store ON customer_profiles (store_id);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_profiles_select ON customer_profiles;
DROP POLICY IF EXISTS customer_profiles_write ON customer_profiles;
CREATE POLICY customer_profiles_select ON customer_profiles
  FOR SELECT USING (is_store_member(store_id));
CREATE POLICY customer_profiles_write ON customer_profiles
  FOR ALL USING (is_store_member(store_id, 'agent'))
  WITH CHECK (is_store_member(store_id, 'agent'));

ALTER TABLE tracking_events
  DROP CONSTRAINT IF EXISTS tracking_events_customer_profile_id_fkey;
ALTER TABLE tracking_events
  ADD CONSTRAINT tracking_events_customer_profile_id_fkey
  FOREIGN KEY (customer_profile_id) REFERENCES customer_profiles(id) ON DELETE SET NULL;

-- Segments
CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_store ON segments (store_id);
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS segments_all ON segments;
CREATE POLICY segments_all ON segments
  FOR ALL USING (is_store_member(store_id))
  WITH CHECK (is_store_member(store_id, 'agent'));

-- Campaigns + variants + events
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'archived')),
  trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  segment_id UUID REFERENCES segments(id) ON DELETE SET NULL,
  frequency_cap INTEGER NOT NULL DEFAULT 1,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  conversion_event TEXT DEFAULT 'purchase_completed',
  attribution_window_hours INTEGER NOT NULL DEFAULT 72,
  consent_required BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_template_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_store ON campaigns (store_id, status);

CREATE TABLE IF NOT EXISTS campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'A',
  weight INTEGER NOT NULL DEFAULT 100,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES campaign_variants(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  visitor_id TEXT,
  event_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign ON campaign_events (campaign_id, created_at DESC);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_all ON campaigns;
CREATE POLICY campaigns_all ON campaigns
  FOR ALL USING (is_store_member(store_id))
  WITH CHECK (is_store_member(store_id, 'agent'));

DROP POLICY IF EXISTS campaign_variants_all ON campaign_variants;
CREATE POLICY campaign_variants_all ON campaign_variants
  FOR ALL USING (is_store_member(store_id))
  WITH CHECK (is_store_member(store_id, 'agent'));

DROP POLICY IF EXISTS campaign_events_select ON campaign_events;
CREATE POLICY campaign_events_select ON campaign_events
  FOR SELECT USING (is_store_member(store_id));

-- Usage counters (Phase 5)
CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL,
  tracked_events INTEGER NOT NULL DEFAULT 0,
  campaign_sends INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, period_ym)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_counters_select ON usage_counters;
CREATE POLICY usage_counters_select ON usage_counters
  FOR SELECT USING (is_store_member(store_id));

-- Support access (time-limited, audited)
CREATE TABLE IF NOT EXISTS support_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  granted_by UUID,
  support_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_access_select ON support_access_grants;
CREATE POLICY support_access_select ON support_access_grants
  FOR SELECT USING (is_workspace_member(organization_id, 'owner'));

-- Data retention markers
CREATE TABLE IF NOT EXISTS retention_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_events INTEGER NOT NULL DEFAULT 0,
  deleted_visitors INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
