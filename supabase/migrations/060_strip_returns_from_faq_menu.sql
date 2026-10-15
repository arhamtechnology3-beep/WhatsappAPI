-- Idempotent: drop Returns & Refund from live FAQ Choose Category lists.
-- Migration 056 already intended this but may not have been applied on prod.
-- Safe to re-run.

DO $$
DECLARE
  faq RECORD;
BEGIN
  FOR faq IN
    SELECT id FROM flows WHERE template_key = 'faq_support' OR name ILIKE '%faq%'
  LOOP
    UPDATE flow_nodes
    SET config = jsonb_set(
      config,
      '{sections}',
      jsonb_build_array(jsonb_build_object(
        'title', 'Support Topics',
        'rows', jsonb_build_array(
          jsonb_build_object(
            'reply_id', 'shipping',
            'title', 'Shipping Info',
            'description', 'Delivery times & fees',
            'next_node_key', 'shipping_info'
          ),
          jsonb_build_object(
            'reply_id', 'human',
            'title', 'Talk to Agent',
            'description', 'Chat with our team',
            'next_node_key', 'agent_handoff'
          )
        )
      ))
    )
    WHERE flow_id = faq.id
      AND node_key = 'faq_list'
      AND node_type = 'send_list'
      AND config::text ILIKE '%return%';

    DELETE FROM flow_nodes
    WHERE flow_id = faq.id AND node_key = 'return_info';
  END LOOP;
END $$;

-- Keep bot template gallery in sync for future installs.
UPDATE bot_templates
SET flow_json = jsonb_set(
  flow_json,
  '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN n->>'node_key' = 'faq_list' THEN
          jsonb_set(
            n,
            '{config,sections}',
            jsonb_build_array(jsonb_build_object(
              'title', 'Support Topics',
              'rows', jsonb_build_array(
                jsonb_build_object(
                  'reply_id', 'shipping',
                  'title', 'Shipping Info',
                  'description', 'Delivery times & fees',
                  'next_node_key', 'shipping_info'
                ),
                jsonb_build_object(
                  'reply_id', 'human',
                  'title', 'Talk to Agent',
                  'description', 'Chat with our team',
                  'next_node_key', 'agent_handoff'
                )
              )
            ))
          )
        ELSE n
      END
    )
    FROM jsonb_array_elements(flow_json->'nodes') AS n
    WHERE n->>'node_key' IS DISTINCT FROM 'return_info'
  )
)
WHERE key = 'faq_support'
  AND flow_json::text ILIKE '%return%';
