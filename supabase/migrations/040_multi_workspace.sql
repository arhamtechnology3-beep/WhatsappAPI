-- ============================================================
-- 040_multi_workspace.sql
--
-- Migration to support Multi-Workspace Architecture.
-- Creates workspaces and workspace_members tables, adds workspace_id
-- to tenant tables, syncs it with account_id, and sets up RLS.
-- ============================================================

-- 1) Create workspaces table (synced with accounts for backwards compat)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  shopify_shop_domain TEXT,
  waba_id TEXT,
  whatsapp_phone_number TEXT,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill workspaces from existing accounts table
INSERT INTO workspaces (id, name, created_at, updated_at)
SELECT id, name, created_at, updated_at FROM accounts
ON CONFLICT (id) DO NOTHING;

-- Generate default slugs
UPDATE workspaces SET slug = COALESCE(LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')), id::text) WHERE slug IS NULL;

-- Add constraints
ALTER TABLE workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
ALTER TABLE workspaces ADD CONSTRAINT workspaces_shopify_shop_domain_key UNIQUE (shopify_shop_domain);

-- 2) Create workspace_members table
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Enable RLS on workspace_members
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_members_policy ON workspace_members;
CREATE POLICY workspace_members_policy ON workspace_members
  FOR ALL USING (
    user_id = auth.uid() 
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Backfill workspace_members from profiles table
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT account_id, user_id,
       CASE 
         WHEN account_role = 'owner' THEN 'owner'::text
         WHEN account_role = 'admin' THEN 'admin'::text
         ELSE 'member'::text
       END
FROM profiles
WHERE account_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 3) Create RLS membership helper
CREATE OR REPLACE FUNCTION is_workspace_member(
  target_workspace_id UUID,
  min_role TEXT DEFAULT 'member'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id = target_workspace_id
      AND CASE wm.role
            WHEN 'owner'  THEN 3
            WHEN 'admin'  THEN 2
            WHEN 'member' THEN 1
            ELSE 0
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 3
            WHEN 'admin'  THEN 2
            WHEN 'member' THEN 1
            ELSE 0
          END
  );
$$;

-- 4) Create trigger function to sync account_id & workspace_id
CREATE OR REPLACE FUNCTION sync_tenant_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.account_id IS NOT NULL THEN
    NEW.workspace_id := NEW.account_id;
  ELSIF NEW.account_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    NEW.account_id := NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Add workspace_id column and setup triggers/policies for each tenant-scoped table
-- helper procedure to apply changes to each table
CREATE OR REPLACE PROCEDURE make_table_multitenant(
  table_name TEXT, 
  acc_col_name TEXT DEFAULT 'account_id'
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Add workspace_id column referencing workspaces table
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE', table_name);
  
  -- Backfill
  EXECUTE format('UPDATE %I SET workspace_id = %I WHERE workspace_id IS NULL', table_name, acc_col_name);
  
  -- Set NOT NULL (if there is data)
  BEGIN
    EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id SET NOT NULL', table_name);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set NOT NULL on table %', table_name;
  END;

  -- Create trigger to sync account_id and workspace_id
  EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_workspace_id ON %I', table_name);
  EXECUTE format('CREATE TRIGGER trg_sync_workspace_id BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_tenant_workspace_id()', table_name);

  -- Enable RLS and setup policy
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('DROP POLICY IF EXISTS %I_workspace_policy ON %I', table_name, table_name);
  EXECUTE format('CREATE POLICY %I_workspace_policy ON %I FOR ALL USING (is_workspace_member(workspace_id))', table_name, table_name);
END;
$$;

-- Apply to all 32 tenant-scoped tables
CALL make_table_multitenant('contacts');
CALL make_table_multitenant('tags');
CALL make_table_multitenant('custom_fields');
CALL make_table_multitenant('contact_notes');
CALL make_table_multitenant('conversations');
CALL make_table_multitenant('whatsapp_config');
CALL make_table_multitenant('message_templates');
CALL make_table_multitenant('pipelines');
CALL make_table_multitenant('deals');
CALL make_table_multitenant('broadcasts');
CALL make_table_multitenant('automations');
CALL make_table_multitenant('automation_logs');
CALL make_table_multitenant('automation_pending_executions');
CALL make_table_multitenant('flows');
CALL make_table_multitenant('flow_runs');
CALL make_table_multitenant('shopify_automation_rules');
CALL make_table_multitenant('shopify_checkouts');
CALL make_table_multitenant('shopify_orders');
CALL make_table_multitenant('shopify_webhook_logs');
CALL make_table_multitenant('whatsapp_send_jobs');
CALL make_table_multitenant('workflow_logs');
CALL make_table_multitenant('merchant_workflows', 'merchant_id');
CALL make_table_multitenant('opt_in_events');
CALL make_table_multitenant('member_presence');
CALL make_table_multitenant('cashfree_orders');
CALL make_table_multitenant('cashfree_config');
CALL make_table_multitenant('merchant_integrations');
CALL make_table_multitenant('webhook_endpoints');
CALL make_table_multitenant('conversation_sources');
CALL make_table_multitenant('api_keys');
CALL make_table_multitenant('shopify_automation_sequences');
CALL make_table_multitenant('shopify_recovery_tracking');

-- Cleanup helper procedure
DROP PROCEDURE IF EXISTS make_table_multitenant(TEXT, TEXT);
