-- Order Status Tracking: after collecting an order number, look the
-- order up in Shopify and send details in WhatsApp. Handoff only if
-- the customer still has a concern (or chose Other Query).

UPDATE bot_templates
SET flow_json = jsonb_set(
  flow_json,
  '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'node_key' IN ('processing_msg', 'check_status_msg')
          AND elem->'config'->>'next_node_key' = 'agent_handoff'
        THEN jsonb_set(
          jsonb_set(
            elem,
            '{config,next_node_key}',
            '"shopify_lookup"'
          ),
          '{config,text}',
          '"Checking details for order #{{vars.order_no}} in our system. One moment..."'
        )
        WHEN elem->>'node_key' = 'agent_handoff'
        THEN jsonb_set(
          elem,
          '{config,note}',
          '"Customer asked to talk to an agent (Other Query, or a concern after seeing Shopify order status). Order #{{vars.order_no}}."'
        )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(flow_json->'nodes') AS elem
  ) || '[
    {
      "node_key": "shopify_lookup",
      "node_type": "http_fetch",
      "config": {
        "kind": "shopify_order",
        "order_var_key": "order_no",
        "found_next": "status_details",
        "not_found_next": "order_not_found"
      }
    },
    {
      "node_key": "status_details",
      "node_type": "send_message",
      "config": {
        "text": "{{vars.order_summary}}",
        "next_node_key": "concern_menu"
      }
    },
    {
      "node_key": "order_not_found",
      "node_type": "send_message",
      "config": {
        "text": "{{vars.order_summary}}",
        "next_node_key": "concern_menu"
      }
    },
    {
      "node_key": "concern_menu",
      "node_type": "send_buttons",
      "config": {
        "text": "Aur kuch help chahiye?",
        "footer_text": "Select an option",
        "buttons": [
          { "reply_id": "all_good", "title": "All good", "next_node_key": "end_ok" },
          { "reply_id": "has_concern", "title": "Talk to agent", "next_node_key": "agent_handoff" }
        ]
      }
    },
    {
      "node_key": "end_ok",
      "node_type": "end",
      "config": {}
    }
  ]'::jsonb
)
WHERE key IN ('order_tracking', 'store_assistant_journey')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(flow_json->'nodes') AS n
    WHERE n->>'node_key' = 'shopify_lookup'
       OR n->>'node_type' = 'http_fetch'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(flow_json->'nodes') AS n
    WHERE n->>'node_key' IN ('processing_msg', 'check_status_msg')
      AND n->'config'->>'next_node_key' = 'agent_handoff'
  );
