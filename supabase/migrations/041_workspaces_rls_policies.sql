-- ============================================================
-- 041_workspaces_rls_policies.sql
--
-- Restores RLS policies on the workspaces (formerly accounts) table
-- to ensure they are queryable by members.
-- ============================================================

-- 1) Enable RLS on workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- 2) Drop any legacy policies
DROP POLICY IF EXISTS workspaces_select ON workspaces;
DROP POLICY IF EXISTS workspaces_update ON workspaces;
DROP POLICY IF EXISTS accounts_select ON workspaces;
DROP POLICY IF EXISTS accounts_update ON workspaces;

-- 3) Create fresh multi-workspace policies
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT USING (is_workspace_member(id));

CREATE POLICY workspaces_update ON workspaces
  FOR UPDATE USING (is_workspace_member(id, 'admin'));

-- 4) Re-create workspace_members policy to prevent recursion
DROP POLICY IF EXISTS workspace_members_policy ON workspace_members;
CREATE POLICY workspace_members_policy ON workspace_members
  FOR ALL USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT id FROM workspaces
    )
  );
