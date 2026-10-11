-- Order Status Tracking bot copy: order numbers are 4 digits (1014) or
-- DP/26/1014, not "6-digit"; and the engine now normalizes "Order#1014"
-- to "1014", so the echo no longer needs a leading "#".

UPDATE flow_nodes
SET config = jsonb_set(
  config,
  '{prompt_text}',
  to_jsonb('Apna order number bhejein (jaise 1014 ya DP/26/1014).'::text)
)
WHERE node_type = 'collect_input'
  AND config->>'prompt_text' ILIKE '%6-digit Order ID%';

UPDATE flow_nodes
SET config = jsonb_set(
  config,
  '{text}',
  to_jsonb('Order {{vars.order_no}} check kar rahe hain, ek second... ⏳'::text)
)
WHERE node_type = 'send_message'
  AND config->>'text' ILIKE 'Checking details for order #{{vars.order_no}}%';
