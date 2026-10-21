-- ============================================================
-- 060_owner_subscription_orgs.sql
--
-- One login (owner_user_id) holds one current subscription.
-- Each Shopify store is its own organization (workspace) with
-- its own WhatsApp number. Organizations point at the owner's
-- subscription via workspaces.subscription_id.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Plans: organization cap (starter 1, growth 3, scale 10)
-- ------------------------------------------------------------
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_organizations INTEGER NOT NULL DEFAULT 1;

UPDATE plans SET max_organizations = 1 WHERE plan_id = 'starter';
UPDATE plans SET max_organizations = 3 WHERE plan_id = 'growth';
UPDATE plans SET max_organizations = 10 WHERE plan_id = 'scale';

-- Also expose in usage_limits JSON for entitlements readers
UPDATE plans
SET usage_limits = COALESCE(usage_limits, '{}'::jsonb)
  || jsonb_build_object('maxOrganizations', max_organizations)
WHERE active = TRUE;

-- ------------------------------------------------------------
-- Subscriptions: one current row per login (owner_user_id)
-- ------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- store_id becomes the shop that approved Shopify billing (optional)
ALTER TABLE subscriptions
  ALTER COLUMN store_id DROP NOT NULL;

-- Events may be login-scoped (no single store)
ALTER TABLE subscription_events
  ALTER COLUMN store_id DROP NOT NULL;

-- Drop per-store uniqueness if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_store_id_key'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_store_id_key;
  END IF;
END $$;

DROP INDEX IF EXISTS subscriptions_store_id_key;

-- ------------------------------------------------------------
-- Workspaces link to the owner's subscription
-- ------------------------------------------------------------
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_subscription
  ON workspaces (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- ------------------------------------------------------------
-- One Shopify shop per organization; globally unique domain
-- ------------------------------------------------------------
-- Keep the newest store per organization if duplicates exist
DELETE FROM stores s
USING stores newer
WHERE s.organization_id = newer.organization_id
  AND s.id <> newer.id
  AND newer.created_at > s.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_one_per_organization
  ON stores (organization_id);

DROP INDEX IF EXISTS idx_stores_org_shop_domain;

-- If two orgs somehow share a domain, keep the older row's domain and
-- null the duplicate so the unique index can apply (ops must reconnect).
UPDATE stores s
SET shop_domain = NULL
FROM stores other
WHERE s.shop_domain IS NOT NULL
  AND other.shop_domain IS NOT NULL
  AND lower(s.shop_domain) = lower(other.shop_domain)
  AND s.id > other.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_shop_domain_global
  ON stores (lower(shop_domain))
  WHERE shop_domain IS NOT NULL;

-- ------------------------------------------------------------
-- Backfill: pick strongest subscription per workspace owner,
-- set owner_user_id, point owned workspaces at that row.
-- ------------------------------------------------------------
DO $$
DECLARE
  owner_rec RECORD;
  keep_id UUID;
BEGIN
  FOR owner_rec IN
    SELECT DISTINCT wm.user_id AS owner_user_id
    FROM workspace_members wm
    WHERE wm.role = 'owner'
  LOOP
    keep_id := NULL;

    -- Prefer an existing subscription already tagged to this owner
    SELECT s.id INTO keep_id
    FROM subscriptions s
    WHERE s.owner_user_id = owner_rec.owner_user_id
    ORDER BY
      CASE s.status
        WHEN 'ACTIVE' THEN 5
        WHEN 'TRIALING' THEN 4
        WHEN 'PAST_DUE' THEN 3
        WHEN 'SUSPENDED' THEN 2
        WHEN 'EXPIRED' THEN 1
        WHEN 'CANCELLED' THEN 1
        WHEN 'UNINSTALLED' THEN 0
        ELSE 0
      END DESC,
      s.updated_at DESC NULLS LAST
    LIMIT 1;

    -- Else pick strongest among orgs this user owns (by organization_id)
    IF keep_id IS NULL THEN
      SELECT s.id INTO keep_id
      FROM subscriptions s
      JOIN workspace_members wm
        ON wm.workspace_id = s.organization_id
       AND wm.user_id = owner_rec.owner_user_id
       AND wm.role = 'owner'
      ORDER BY
        CASE s.status
          WHEN 'ACTIVE' THEN 5
          WHEN 'TRIALING' THEN 4
          WHEN 'PAST_DUE' THEN 3
          WHEN 'SUSPENDED' THEN 2
          WHEN 'EXPIRED' THEN 1
          WHEN 'CANCELLED' THEN 1
          WHEN 'UNINSTALLED' THEN 0
          ELSE 0
        END DESC,
        s.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    -- Else consider store-linked subscriptions under owned orgs
    IF keep_id IS NULL THEN
      SELECT s.id INTO keep_id
      FROM subscriptions s
      JOIN stores st ON st.id = s.store_id
      JOIN workspace_members wm
        ON wm.workspace_id = st.organization_id
       AND wm.user_id = owner_rec.owner_user_id
       AND wm.role = 'owner'
      ORDER BY
        CASE s.status
          WHEN 'ACTIVE' THEN 5
          WHEN 'TRIALING' THEN 4
          WHEN 'PAST_DUE' THEN 3
          WHEN 'SUSPENDED' THEN 2
          WHEN 'EXPIRED' THEN 1
          WHEN 'CANCELLED' THEN 1
          WHEN 'UNINSTALLED' THEN 0
          ELSE 0
        END DESC,
        s.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF keep_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE subscriptions
    SET owner_user_id = owner_rec.owner_user_id,
        updated_at = NOW()
    WHERE id = keep_id;

    UPDATE workspaces w
    SET subscription_id = keep_id
    FROM workspace_members wm
    WHERE wm.workspace_id = w.id
      AND wm.user_id = owner_rec.owner_user_id
      AND wm.role = 'owner'
      AND (w.subscription_id IS NULL OR w.subscription_id <> keep_id);

    INSERT INTO subscription_events (
      subscription_id, store_id, organization_id,
      from_status, to_status, event, actor_user_id, metadata
    )
    SELECT
      keep_id,
      s.store_id,
      s.organization_id,
      s.status,
      s.status,
      'OWNER_SUBSCRIPTION_MERGED',
      owner_rec.owner_user_id,
      jsonb_build_object('owner_user_id', owner_rec.owner_user_id)
    FROM subscriptions s
    WHERE s.id = keep_id
    AND NOT EXISTS (
      SELECT 1 FROM subscription_events se
      WHERE se.subscription_id = keep_id
        AND se.event = 'OWNER_SUBSCRIPTION_MERGED'
        AND se.actor_user_id = owner_rec.owner_user_id
    );
  END LOOP;
END $$;

-- Deduplicate: if an owner somehow has multiple owner_user_id rows,
-- keep the strongest and clear the rest so the unique index can apply.
DO $$
DECLARE
  r RECORD;
  keep_id UUID;
BEGIN
  FOR r IN
    SELECT owner_user_id
    FROM subscriptions
    WHERE owner_user_id IS NOT NULL
    GROUP BY owner_user_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM subscriptions
    WHERE owner_user_id = r.owner_user_id
    ORDER BY
      CASE status
        WHEN 'ACTIVE' THEN 5
        WHEN 'TRIALING' THEN 4
        WHEN 'PAST_DUE' THEN 3
        WHEN 'SUSPENDED' THEN 2
        WHEN 'EXPIRED' THEN 1
        ELSE 0
      END DESC,
      updated_at DESC NULLS LAST
    LIMIT 1;

    UPDATE workspaces
    SET subscription_id = keep_id
    WHERE subscription_id IN (
      SELECT id FROM subscriptions
      WHERE owner_user_id = r.owner_user_id AND id <> keep_id
    );

    UPDATE subscriptions
    SET owner_user_id = NULL
    WHERE owner_user_id = r.owner_user_id
      AND id <> keep_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_owner_user_id
  ON subscriptions (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id
  ON subscriptions (store_id)
  WHERE store_id IS NOT NULL;

-- ------------------------------------------------------------
-- RLS: owners can read/write their login subscription; members
-- can still read via organization link.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
DROP POLICY IF EXISTS subscriptions_write ON subscriptions;

CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (
    owner_user_id = auth.uid()
    OR is_workspace_member(organization_id)
    OR (store_id IS NOT NULL AND is_store_member(store_id))
    OR EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.subscription_id = subscriptions.id
        AND is_workspace_member(w.id)
    )
  );

CREATE POLICY subscriptions_write ON subscriptions
  FOR ALL USING (
    owner_user_id = auth.uid()
    OR is_workspace_member(organization_id, 'admin')
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR is_workspace_member(organization_id, 'admin')
  );
