-- Expand order-notification rules so COD and prepaid can be configured
-- independently, and turn on sequences/rules that the Shopify App UI
-- presents as Active (those toggles previously did not persist).

ALTER TABLE shopify_automation_rules DROP CONSTRAINT IF EXISTS shopify_automation_rules_trigger_type_check;
ALTER TABLE shopify_automation_rules ADD CONSTRAINT shopify_automation_rules_trigger_type_check
  CHECK (trigger_type IN (
    'cart_abandoned',
    'order_created',
    'cod_confirmation',
    'order_fulfilled',
    'order_delivered'
  ));

INSERT INTO shopify_automation_rules (account_id, trigger_type, template_name, template_variable_mapping, delay_minutes, is_active, meta_approval_status)
SELECT
  a.id,
  'cod_confirmation',
  'wacrm_cod_confirmation_v1',
  '["customer_name", "order_number", "total_price"]'::jsonb,
  0,
  true,
  'approved'
FROM accounts a
ON CONFLICT (account_id, trigger_type) DO NOTHING;

UPDATE shopify_automation_rules
SET is_active = true,
    meta_approval_status = 'approved',
    updated_at = NOW()
WHERE trigger_type IN ('order_created', 'order_fulfilled', 'order_delivered', 'cod_confirmation', 'cart_abandoned');

UPDATE shopify_automation_sequences
SET is_active = true,
    updated_at = NOW();

UPDATE shopify_automation_sequence_steps
SET is_active = true,
    meta_approval_status = 'approved';

CREATE OR REPLACE FUNCTION seed_shopify_automation_rules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shopify_automation_rules (account_id, trigger_type, template_name, template_variable_mapping, delay_minutes, is_active, meta_approval_status)
  VALUES
    (NEW.id, 'cart_abandoned', 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb, 30, true, 'approved'),
    (NEW.id, 'order_created', 'wacrm_order_confirmed_v1', '["customer_name", "order_number", "total_price"]'::jsonb, 0, true, 'approved'),
    (NEW.id, 'cod_confirmation', 'wacrm_cod_confirmation_v1', '["customer_name", "order_number", "total_price"]'::jsonb, 0, true, 'approved'),
    (NEW.id, 'order_fulfilled', 'wacrm_order_shipped_v1', '["customer_name", "order_number", "tracking_url"]'::jsonb, 0, true, 'approved'),
    (NEW.id, 'order_delivered', 'wacrm_order_delivered_v1', '["customer_name", "order_number"]'::jsonb, 0, true, 'approved')
  ON CONFLICT (account_id, trigger_type) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION seed_shopify_automation_sequences()
RETURNS TRIGGER AS $$
DECLARE
  cart_seq_id UUID;
  browse_seq_id UUID;
BEGIN
  INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
  VALUES (NEW.id, 'cart_abandoned', 'Cart Abandonment Recovery', true)
  RETURNING id INTO cart_seq_id;

  INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping, meta_approval_status, is_active)
  VALUES
    (cart_seq_id, 1, 30, 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb, 'approved', true),
    (cart_seq_id, 2, 1440, 'wacrm_cart_reminder_step2_v1', '["customer_name", "product_name", "total_price"]'::jsonb, 'approved', true),
    (cart_seq_id, 3, 1440, 'wacrm_cart_reminder_step3_v1', '["customer_name", "product_name", "checkout_url", "discount_code"]'::jsonb, 'approved', true);

  INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
  VALUES (NEW.id, 'browse_abandoned', 'Browse Abandonment Recovery', true)
  RETURNING id INTO browse_seq_id;

  INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping, meta_approval_status, is_active)
  VALUES
    (browse_seq_id, 1, 30, 'wacrm_browse_abandoned_v1', '["customer_name", "product_name", "total_price", "product_url"]'::jsonb, 'approved', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
