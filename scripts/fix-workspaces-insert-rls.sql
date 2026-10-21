-- Allow authenticated users to create a new store organization.
-- Membership is added in the same API request; until then they are not
-- a member, so SELECT/UPDATE policies alone blocked INSERT (RLS error
-- when clicking Add another store → Create).

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_insert ON workspaces;
CREATE POLICY workspaces_insert ON workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS workspaces_delete ON workspaces;
CREATE POLICY workspaces_delete ON workspaces
  FOR DELETE
  USING (is_workspace_member(id, 'owner'));

-- Owner can insert themselves (and invitees) as members of a workspace
-- they just created. Existing FOR ALL policy may not cover INSERT WITH CHECK
-- cleanly across Postgres versions — add an explicit insert policy.
DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
CREATE POLICY workspace_members_insert ON workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR is_workspace_member(workspace_id, 'admin')
  );
