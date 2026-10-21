-- Inbox inquiry → purchase drip: customers who messaged about products
-- but never placed a Shopify order get a tight 2-day marketing follow-up.
-- Enrollment + sends run from cron (sequence worker); stops on any order.

ALTER TABLE shopify_automation_sequences
  DROP CONSTRAINT IF EXISTS shopify_automation_sequences_trigger_type_check;

ALTER TABLE shopify_automation_sequences
  ADD CONSTRAINT shopify_automation_sequences_trigger_type_check
  CHECK (trigger_type IN (
    'cart_abandoned',
    'browse_abandoned',
    'shopify_customer_created',
    'inquiry_no_purchase'
  ));

INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
SELECT a.id, 'inquiry_no_purchase', 'Inquiry No-Purchase Follow-up', true
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM shopify_automation_sequences s
  WHERE s.account_id = a.id AND s.trigger_type = 'inquiry_no_purchase'
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
    -- Step 1 fires at enrollment (silence already waited); then day-1 and day-2 nudges.
    (1, 0, 'wacrm_festival_broadcast_v2', '["customer_name"]'),
    (2, 1200, 'wacrm_browse_abandoned_v2', '["customer_name","product_name"]'),
    (3, 1440, 'wacrm_cart_reminder_step2_v2', '["customer_name","product_name"]')
) AS v(step_order, delay_minutes, template_name, mapping)
WHERE s.trigger_type = 'inquiry_no_purchase'
  AND NOT EXISTS (
    SELECT 1 FROM shopify_automation_sequence_steps st
    WHERE st.sequence_id = s.id AND st.step_order = v.step_order
  );

UPDATE shopify_automation_sequence_steps st
SET meta_approval_status = 'approved'
FROM shopify_automation_sequences s,
     message_templates t
WHERE st.sequence_id = s.id
  AND s.trigger_type = 'inquiry_no_purchase'
  AND t.account_id = s.account_id
  AND t.name = st.template_name
  AND upper(t.status) = 'APPROVED';
