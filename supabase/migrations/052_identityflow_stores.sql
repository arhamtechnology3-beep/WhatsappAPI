-- ============================================================
-- 052_identityflow_stores.sql
--
-- IdentityFlow Phase 0: first-class stores under existing
-- workspaces (organizations), per-store billing rows, encrypted
-- Shopify connection placeholder, audit/consent stubs, and lock
-- down open anon RLS on visitor tracking tables.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Stores (organization = workspaces.id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shop_domain TEXT,
  shopify_shop_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'pending_install'
    CHECK (status IN (
      'pending_install',
      'active',
      'suspended',
      'uninstalled'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_org_shop_domain
  ON stores (organization_id, shop_domain)
  WHERE shop_domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_shopify_shop_id
  ON stores (shopify_shop_id)
  WHERE shopify_shop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_organization
  ON stores (organization_id);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Store members (agent/viewer assignments). Org owner/admin
-- bypass via is_store_member().
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_members_user ON store_members (user_id);
CREATE INDEX IF NOT EXISTS idx_store_members_org ON store_members (organization_id);

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_store_member(
  target_store_id UUID,
  min_role TEXT DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM stores s
    WHERE s.id = target_store_id
      AND (
        is_workspace_member(s.organization_id, 'admin')
        OR EXISTS (
          SELECT 1
          FROM store_members sm
          WHERE sm.store_id = target_store_id
            AND sm.user_id = auth.uid()
            AND CASE sm.role
              WHEN 'owner'  THEN 4
              WHEN 'admin'  THEN 3
              WHEN 'agent'  THEN 2
              WHEN 'viewer' THEN 1
              ELSE 0
            END
            >=
            CASE min_role
              WHEN 'owner'  THEN 4
              WHEN 'admin'  THEN 3
              WHEN 'agent'  THEN 2
              WHEN 'viewer' THEN 1
              ELSE 1
            END
        )
      )
  );
$$;

DROP POLICY IF EXISTS stores_select ON stores;
DROP POLICY IF EXISTS stores_insert ON stores;
DROP POLICY IF EXISTS stores_update ON stores;
DROP POLICY IF EXISTS stores_delete ON stores;

CREATE POLICY stores_select ON stores
  FOR SELECT USING (is_store_member(id) OR is_workspace_member(organization_id));
CREATE POLICY stores_insert ON stores
  FOR INSERT WITH CHECK (is_workspace_member(organization_id, 'admin'));
CREATE POLICY stores_update ON stores
  FOR UPDATE USING (is_store_member(id, 'admin') OR is_workspace_member(organization_id, 'admin'));
CREATE POLICY stores_delete ON stores
  FOR DELETE USING (is_workspace_member(organization_id, 'owner'));

DROP POLICY IF EXISTS store_members_select ON store_members;
DROP POLICY IF EXISTS store_members_write ON store_members;

CREATE POLICY store_members_select ON store_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_workspace_member(organization_id, 'admin')
    OR is_store_member(store_id)
  );
CREATE POLICY store_members_write ON store_members
  FOR ALL USING (is_workspace_member(organization_id, 'admin'))
  WITH CHECK (is_workspace_member(organization_id, 'admin'));

-- ------------------------------------------------------------
-- Shopify connections (encrypted token; Phase 1 runtime)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  shopify_shop_id TEXT,
  encrypted_access_token TEXT,
  scopes TEXT,
  installed_at TIMESTAMPTZ,
  uninstalled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_connections_shop_domain
  ON shopify_connections (shop_domain);

ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopify_connections_select ON shopify_connections;
DROP POLICY IF EXISTS shopify_connections_write ON shopify_connections;

CREATE POLICY shopify_connections_select ON shopify_connections
  FOR SELECT USING (is_store_member(store_id));
CREATE POLICY shopify_connections_write ON shopify_connections
  FOR ALL USING (is_workspace_member(organization_id, 'admin'))
  WITH CHECK (is_workspace_member(organization_id, 'admin'));

-- ------------------------------------------------------------
-- Plans (never hardcode prices in the frontend)
-- Prices are integer minor units (cents).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  monthly_price INTEGER NOT NULL DEFAULT 0,
  annual_price INTEGER NOT NULL DEFAULT 0,
  shopify_plan_handle TEXT,
  trial_days INTEGER NOT NULL DEFAULT 7,
  feature_entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select ON plans;
CREATE POLICY plans_select ON plans
  FOR SELECT USING (active = TRUE);

INSERT INTO plans (
  plan_id, display_name, currency, monthly_price, annual_price,
  shopify_plan_handle, trial_days, feature_entitlements, usage_limits, active, version
) VALUES
  (
    'starter',
    'Starter',
    'USD',
    1900,
    19000,
    'starter',
    7,
    '{"visitorTracking":true,"otpLogin":true,"passkeys":false,"campaigns":true,"advancedSegments":false,"whatsappAutomation":false}'::jsonb,
    '{"monthlyTrackedEvents":25000,"campaigns":5}'::jsonb,
    TRUE,
    1
  ),
  (
    'growth',
    'Growth',
    'USD',
    4900,
    49000,
    'growth',
    7,
    '{"visitorTracking":true,"otpLogin":true,"passkeys":true,"campaigns":true,"advancedSegments":true,"whatsappAutomation":true}'::jsonb,
    '{"monthlyTrackedEvents":100000,"campaigns":20}'::jsonb,
    TRUE,
    1
  ),
  (
    'scale',
    'Scale',
    'USD',
    9900,
    99000,
    'scale',
    7,
    '{"visitorTracking":true,"otpLogin":true,"passkeys":true,"campaigns":true,"advancedSegments":true,"whatsappAutomation":true}'::jsonb,
    '{"monthlyTrackedEvents":500000,"campaigns":100}'::jsonb,
    TRUE,
    1
  )
ON CONFLICT (plan_id) DO NOTHING;

-- ------------------------------------------------------------
-- Subscriptions (one current row per store)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(plan_id),
  status TEXT NOT NULL DEFAULT 'PENDING_INSTALL'
    CHECK (status IN (
      'PENDING_INSTALL',
      'TRIALING',
      'ACTIVE',
      'PAST_DUE',
      'CANCELLED',
      'EXPIRED',
      'SUSPENDED',
      'UNINSTALLED'
    )),
  shopify_subscription_id TEXT,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
DROP POLICY IF EXISTS subscriptions_write ON subscriptions;

CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (is_store_member(store_id) OR is_workspace_member(organization_id));
CREATE POLICY subscriptions_write ON subscriptions
  FOR ALL USING (is_workspace_member(organization_id, 'admin'))
  WITH CHECK (is_workspace_member(organization_id, 'admin'));

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event TEXT NOT NULL,
  actor_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_store ON subscription_events (store_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_events_select ON subscription_events;
CREATE POLICY subscription_events_select ON subscription_events
  FOR SELECT USING (is_workspace_member(organization_id, 'admin'));

-- ------------------------------------------------------------
-- Shop trial history — never reset a trial on reinstall
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_trial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT NOT NULL,
  shopify_shop_id TEXT,
  organization_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  first_trial_started_at TIMESTAMPTZ NOT NULL,
  first_trial_ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_trial_history_domain
  ON shop_trial_history (lower(shop_domain));

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_trial_history_shop_id
  ON shop_trial_history (shopify_shop_id)
  WHERE shopify_shop_id IS NOT NULL;

ALTER TABLE shop_trial_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_trial_history_select ON shop_trial_history;
CREATE POLICY shop_trial_history_select ON shop_trial_history
  FOR SELECT USING (
    organization_id IS NOT NULL AND is_workspace_member(organization_id, 'admin')
  );

-- ------------------------------------------------------------
-- Audit logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  actor_user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs (store_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    organization_id IS NOT NULL AND is_workspace_member(organization_id, 'admin')
  );

-- ------------------------------------------------------------
-- Consent records (stub for Phase 2 ingest)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL DEFAULT 'visitor'
    CHECK (subject_type IN ('visitor', 'customer', 'contact')),
  subject_id TEXT,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'denied', 'withdrawn')),
  source TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_consent_records_store ON consent_records (store_id);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_records_select ON consent_records;
CREATE POLICY consent_records_select ON consent_records
  FOR SELECT USING (is_store_member(store_id));

-- ------------------------------------------------------------
-- Visitor tracking: ensure tables exist (030 may not be applied on
-- some production DBs), then add store_id and close anon RLS.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id          TEXT NOT NULL,
  session_id          TEXT NOT NULL UNIQUE,
  device_type         TEXT,
  referrer_source     TEXT,
  utm_params          JSONB,
  device_fingerprint  TEXT,
  session_start       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pages_viewed        JSONB DEFAULT '[]'::jsonb,
  products_viewed     JSONB DEFAULT '[]'::jsonb,
  cart_events         JSONB DEFAULT '[]'::jsonb,
  associated_name     TEXT,
  associated_phone    TEXT,
  associated_email    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitor_identity_map (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id       TEXT NOT NULL,
  phone_number     TEXT NOT NULL,
  first_linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(visitor_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id    ON visitor_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_session_id    ON visitor_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_phone   ON visitor_identity_map(phone_number);
CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_visitor ON visitor_identity_map(visitor_id);

ALTER TABLE visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_identity_map ENABLE ROW LEVEL SECURITY;

ALTER TABLE visitor_sessions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

ALTER TABLE visitor_identity_map
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_store ON visitor_sessions (store_id);
CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_store ON visitor_identity_map (store_id);

DROP POLICY IF EXISTS "anon_insert_visitor_sessions" ON visitor_sessions;
DROP POLICY IF EXISTS "anon_update_visitor_sessions" ON visitor_sessions;
DROP POLICY IF EXISTS "anon_select_visitor_sessions" ON visitor_sessions;
DROP POLICY IF EXISTS "anon_insert_visitor_identity_map" ON visitor_identity_map;

DROP POLICY IF EXISTS visitor_sessions_member_select ON visitor_sessions;
DROP POLICY IF EXISTS visitor_identity_map_member_select ON visitor_identity_map;

CREATE POLICY visitor_sessions_member_select ON visitor_sessions
  FOR SELECT USING (store_id IS NOT NULL AND is_store_member(store_id));

CREATE POLICY visitor_identity_map_member_select ON visitor_identity_map
  FOR SELECT USING (store_id IS NOT NULL AND is_store_member(store_id));

-- Ingest goes through Next.js (service role). No anon writes.

-- ------------------------------------------------------------
-- Backfill: one store per workspace that already has a shop domain
-- ------------------------------------------------------------
INSERT INTO stores (organization_id, name, shop_domain, status, created_at, updated_at)
SELECT
  w.id,
  COALESCE(NULLIF(w.name, ''), w.shopify_shop_domain, 'Shopify store'),
  w.shopify_shop_domain,
  CASE WHEN w.status = 'suspended' THEN 'uninstalled' ELSE 'pending_install' END,
  w.created_at,
  NOW()
FROM workspaces w
WHERE w.shopify_shop_domain IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.organization_id = w.id
      AND s.shop_domain = w.shopify_shop_domain
  );

INSERT INTO store_members (store_id, organization_id, user_id, role)
SELECT
  s.id,
  s.organization_id,
  wm.user_id,
  CASE
    WHEN wm.role = 'owner' THEN 'owner'
    WHEN wm.role = 'admin' THEN 'admin'
    ELSE 'agent'
  END
FROM stores s
JOIN workspace_members wm ON wm.workspace_id = s.organization_id
ON CONFLICT (store_id, user_id) DO NOTHING;

INSERT INTO shopify_connections (store_id, organization_id, shop_domain, installed_at)
SELECT s.id, s.organization_id, s.shop_domain, s.created_at
FROM stores s
WHERE s.shop_domain IS NOT NULL
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO subscriptions (store_id, organization_id, plan_id, status)
SELECT s.id, s.organization_id, 'growth', 'PENDING_INSTALL'
FROM stores s
ON CONFLICT (store_id) DO NOTHING;
