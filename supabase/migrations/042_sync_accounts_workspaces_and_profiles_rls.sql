-- ============================================================
-- 042_sync_accounts_workspaces_and_profiles_rls.sql
--
-- Adds default_currency to workspaces, sets up bidirectional sync
-- between accounts & workspaces, and restores the profiles select policy.
-- ============================================================

-- 1) Add default_currency column to workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'USD';

-- 2) Backfill existing default_currency values from accounts to workspaces
UPDATE workspaces w
SET default_currency = COALESCE(a.default_currency, 'USD')
FROM accounts a
WHERE w.id = a.id;

-- 3) Create trigger to sync workspaces insertions/updates to accounts
CREATE OR REPLACE FUNCTION sync_workspaces_to_accounts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO accounts (id, name, default_currency, created_at, updated_at)
  VALUES (NEW.id, NEW.name, NEW.default_currency, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    default_currency = EXCLUDED.default_currency,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_workspaces_to_accounts ON workspaces;
CREATE TRIGGER trg_sync_workspaces_to_accounts
  AFTER INSERT OR UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION sync_workspaces_to_accounts();

-- 4) Create trigger to sync accounts updates/insertions to workspaces
CREATE OR REPLACE FUNCTION sync_accounts_to_workspaces()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (id, name, default_currency, created_at, updated_at)
  VALUES (NEW.id, NEW.name, NEW.default_currency, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    default_currency = EXCLUDED.default_currency,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_accounts_to_workspaces ON accounts;
CREATE TRIGGER trg_sync_accounts_to_workspaces
  AFTER INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION sync_accounts_to_workspaces();

-- 5) Re-create profiles select policy (dropped during function cascade)
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM workspace_members m1
      JOIN workspace_members m2 ON m1.workspace_id = m2.workspace_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.user_id
    )
  );
