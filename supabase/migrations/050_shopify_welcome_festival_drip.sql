-- New Shopify customer welcome drip: festival at 30 min, then shop-now
-- follow-up at 5 hours (9:30 AM–8:30 PM IST is enforced in the cron).

ALTER TABLE shopify_automation_sequences
  DROP CONSTRAINT IF EXISTS shopify_automation_sequences_trigger_type_check;

ALTER TABLE shopify_automation_sequences
  ADD CONSTRAINT shopify_automation_sequences_trigger_type_check
  CHECK (trigger_type IN ('cart_abandoned', 'browse_abandoned', 'shopify_customer_created'));

INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
SELECT a.id, 'shopify_customer_created', 'New Shopify Contact Welcome', true
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM shopify_automation_sequences s
  WHERE s.account_id = a.id AND s.trigger_type = 'shopify_customer_created'
);

INSERT INTO shopify_automation_sequence_steps (
  sequence_id,
  step_order,
  delay_minutes_from_previous_step,
  template_name,
  template_variable_mapping,
  meta_approval_status,
  is_active
)
SELECT
  s.id,
  v.step_order,
  v.delay_minutes,
  v.template_name,
  v.mapping::jsonb,
  'not_submitted',
  true
FROM shopify_automation_sequences s
CROSS JOIN (
  VALUES
    (1, 30, 'wacrm_festival_broadcast_v2', '["customer_name"]'),
    (2, 300, 'wacrm_shop_now_followup_v1', '["customer_name"]')
) AS v(step_order, delay_minutes, template_name, mapping)
WHERE s.trigger_type = 'shopify_customer_created'
  AND NOT EXISTS (
    SELECT 1 FROM shopify_automation_sequence_steps st
    WHERE st.sequence_id = s.id AND st.step_order = v.step_order
  );

UPDATE shopify_automation_sequence_steps st
SET meta_approval_status = 'approved'
FROM shopify_automation_sequences s
JOIN message_templates t
  ON t.account_id = s.account_id
 AND t.name = st.template_name
 AND upper(t.status) = 'APPROVED'
WHERE st.sequence_id = s.id
  AND s.trigger_type = 'shopify_customer_created';
