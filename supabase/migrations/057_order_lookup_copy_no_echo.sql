-- Order Status Tracking: the "checking" message echoed whatever the
-- customer typed ("Order No order has been created... check kar rahe hain").

UPDATE flow_nodes
SET config = jsonb_set(
  config,
  '{text}',
  to_jsonb('Aapka order check kar rahe hain, ek second... ⏳'::text)
)
WHERE node_type = 'send_message'
  AND config->>'text' = 'Order {{vars.order_no}} check kar rahe hain, ek second... ⏳';
