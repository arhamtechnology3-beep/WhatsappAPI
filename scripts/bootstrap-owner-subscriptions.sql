-- Ops: give every workspace owner a login subscription if missing.
-- Run in Supabase SQL Editor on production after 060.
-- Safe to re-run. Creates a TRIALING growth plan (max 3 orgs) when no
-- subscription can be claimed from an existing org/store row.

DO $$
DECLARE
  owner_rec RECORD;
  org_id UUID;
  keep_id UUID;
  trial_end TIMESTAMPTZ := NOW() + INTERVAL '14 days';
BEGIN
  FOR owner_rec IN
    SELECT DISTINCT wm.user_id AS owner_user_id
    FROM workspace_members wm
    WHERE wm.role = 'owner'
  LOOP
    -- Already has a login subscription
    IF EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.owner_user_id = owner_rec.owner_user_id
    ) THEN
      CONTINUE;
    END IF;

    SELECT wm.workspace_id INTO org_id
    FROM workspace_members wm
    WHERE wm.user_id = owner_rec.owner_user_id
      AND wm.role = 'owner'
    ORDER BY wm.joined_at ASC NULLS LAST
    LIMIT 1;

    IF org_id IS NULL THEN
      CONTINUE;
    END IF;

    keep_id := NULL;

    SELECT w.subscription_id INTO keep_id
    FROM workspaces w
    WHERE w.id = org_id
      AND w.subscription_id IS NOT NULL;

    IF keep_id IS NULL THEN
      SELECT s.id INTO keep_id
      FROM subscriptions s
      WHERE s.organization_id = org_id
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF keep_id IS NULL THEN
      SELECT s.id INTO keep_id
      FROM subscriptions s
      JOIN stores st ON st.id = s.store_id
      WHERE st.organization_id = org_id
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF keep_id IS NOT NULL THEN
      UPDATE subscriptions
      SET owner_user_id = owner_rec.owner_user_id,
          updated_at = NOW()
      WHERE id = keep_id;

      UPDATE workspaces
      SET subscription_id = keep_id
      WHERE id = org_id
        AND (subscription_id IS NULL OR subscription_id <> keep_id);
    ELSE
      INSERT INTO subscriptions (
        owner_user_id, organization_id, store_id, plan_id, status,
        trial_start, trial_end, updated_at
      )
      VALUES (
        owner_rec.owner_user_id, org_id, NULL, 'growth', 'TRIALING',
        NOW(), trial_end, NOW()
      )
      RETURNING id INTO keep_id;

      UPDATE workspaces
      SET subscription_id = keep_id
      WHERE id = org_id;
    END IF;
  END LOOP;
END $$;

SELECT
  s.owner_user_id,
  s.plan_id,
  s.status,
  s.trial_end,
  p.max_organizations,
  (
    SELECT count(*) FROM workspace_members wm
    WHERE wm.user_id = s.owner_user_id AND wm.role = 'owner'
  ) AS owned_orgs
FROM subscriptions s
LEFT JOIN plans p ON p.plan_id = s.plan_id
WHERE s.owner_user_id IS NOT NULL
ORDER BY s.updated_at DESC;
