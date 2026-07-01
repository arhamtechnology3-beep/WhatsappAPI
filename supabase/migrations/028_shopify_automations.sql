-- ============================================================
-- 028_shopify_automations.sql
--
-- Adds the shopify_automation_rules table to track WhatsApp
-- notification automation templates, statuses, and delays.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cart_abandoned', 'order_created', 'order_fulfilled', 'order_delivered')),
  template_name TEXT NOT NULL,
  template_variable_mapping JSONB NOT NULL DEFAULT '[]'::jsonb,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  meta_approval_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (meta_approval_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_shopify_automation_rules_account ON shopify_automation_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_shopify_automation_rules_trigger ON shopify_automation_rules(trigger_type);

-- Update shopify_webhook_logs status check constraint
ALTER TABLE shopify_webhook_logs DROP CONSTRAINT IF EXISTS shopify_webhook_logs_status_check;
ALTER TABLE shopify_webhook_logs ADD CONSTRAINT shopify_webhook_logs_status_check CHECK (status IN ('success', 'failed', 'skipped_not_activated'));

-- Enable RLS
ALTER TABLE shopify_automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS shopify_automation_rules_select ON shopify_automation_rules;
DROP POLICY IF EXISTS shopify_automation_rules_insert ON shopify_automation_rules;
DROP POLICY IF EXISTS shopify_automation_rules_update ON shopify_automation_rules;
DROP POLICY IF EXISTS shopify_automation_rules_delete ON shopify_automation_rules;

CREATE POLICY shopify_automation_rules_select ON shopify_automation_rules FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_automation_rules_insert ON shopify_automation_rules FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_automation_rules_update ON shopify_automation_rules FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_automation_rules_delete ON shopify_automation_rules FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_shopify_automation_rules_updated_at ON shopify_automation_rules;
CREATE TRIGGER set_shopify_automation_rules_updated_at BEFORE UPDATE ON shopify_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed for existing accounts
INSERT INTO shopify_automation_rules (account_id, trigger_type, template_name, template_variable_mapping, delay_minutes)
SELECT
  a.id,
  t.trigger_type,
  t.template_name,
  t.template_variable_mapping,
  t.delay_minutes
FROM accounts a
CROSS JOIN (
  VALUES
    ('cart_abandoned', 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb, 30),
    ('order_created', 'wacrm_order_confirmed_v1', '["customer_name", "order_number", "total_price"]'::jsonb, 0),
    ('order_fulfilled', 'wacrm_order_shipped_v1', '["customer_name", "order_number", "tracking_url"]'::jsonb, 0),
    ('order_delivered', 'wacrm_order_delivered_v1', '["customer_name", "order_number"]'::jsonb, 0)
) t(trigger_type, template_name, template_variable_mapping, delay_minutes)
ON CONFLICT (account_id, trigger_type) DO NOTHING;

-- Trigger to automatically seed rules for new accounts
CREATE OR REPLACE FUNCTION seed_shopify_automation_rules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shopify_automation_rules (account_id, trigger_type, template_name, template_variable_mapping, delay_minutes)
  VALUES
    (NEW.id, 'cart_abandoned', 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb, 30),
    (NEW.id, 'order_created', 'wacrm_order_confirmed_v1', '["customer_name", "order_number", "total_price"]'::jsonb, 0),
    (NEW.id, 'order_fulfilled', 'wacrm_order_shipped_v1', '["customer_name", "order_number", "tracking_url"]'::jsonb, 0),
    (NEW.id, 'order_delivered', 'wacrm_order_delivered_v1', '["customer_name", "order_number"]'::jsonb, 0)
  ON CONFLICT (account_id, trigger_type) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_shopify_automation_rules ON accounts;
CREATE TRIGGER trg_seed_shopify_automation_rules
AFTER INSERT ON accounts
FOR EACH ROW
EXECUTE FUNCTION seed_shopify_automation_rules();
