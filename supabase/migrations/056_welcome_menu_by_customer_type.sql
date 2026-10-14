-- Welcome menus by customer type, and pause B2B Lead capture.
--
-- Existing customer (has a Shopify order) saying hi/hello/help:
--   list with Shipping Info + Talk to Agent (Returns & Refund removed).
-- New customer (no Shopify order), first message or hi/hello/help:
--   buttons Shop Bestsellers / Shipping Info / Talk to Agent.
-- "Talk to Agent" itself is answered by the app (chat button in office
-- hours, office-hours note otherwise), not by these nodes.
--
-- Needs the app build that understands contact_field
-- 'shopify_order_count'; on older builds the condition node fails the run.

DO $$
DECLARE
  faq RECORD;
  welcome_id UUID;
  new_menu JSONB := jsonb_build_object(
    'text', 'Namaste! 🙏 Welcome to DivyaPrabha Foods. How can we help you today?',
    'buttons', jsonb_build_array(
      jsonb_build_object('reply_id', 'shop_bestsellers', 'title', 'Shop Bestsellers', 'next_node_key', 'shop_bestsellers'),
      jsonb_build_object('reply_id', 'shipping', 'title', 'Shipping Info', 'next_node_key', 'shipping_info'),
      jsonb_build_object('reply_id', 'human', 'title', 'Talk to Agent', 'next_node_key', 'agent_handoff')
    )
  );
  shop_msg JSONB := jsonb_build_object(
    'text', E'Our bestsellers 🛒\nhttps://divyaprabhafoods.com/collections/all-products',
    'next_node_key', 'end_nodes'
  );
BEGIN
  FOR faq IN
    SELECT * FROM flows WHERE template_key = 'faq_support'
  LOOP
    -- 1) Existing-customer list: drop Returns & Refund.
    UPDATE flow_nodes
    SET config = jsonb_set(
      config,
      '{sections}',
      jsonb_build_array(jsonb_build_object(
        'title', 'Support Topics',
        'rows', jsonb_build_array(
          jsonb_build_object('reply_id', 'shipping', 'title', 'Shipping Info', 'description', 'Delivery times & fees', 'next_node_key', 'shipping_info'),
          jsonb_build_object('reply_id', 'human', 'title', 'Talk to Agent', 'description', 'Chat with our team', 'next_node_key', 'agent_handoff')
        )
      ))
    )
    WHERE flow_id = faq.id AND node_key = 'faq_list';

    DELETE FROM flow_nodes WHERE flow_id = faq.id AND node_key = 'return_info';

    -- 2) Branch on Shopify orders before the menu.
    INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y) VALUES
      (faq.id, 'check_customer', 'condition', jsonb_build_object(
        'subject', 'contact_field',
        'subject_key', 'shopify_order_count',
        'operator', 'present',
        'true_next', 'faq_list',
        'false_next', 'new_customer_menu'
      ), 0, 120),
      (faq.id, 'new_customer_menu', 'send_buttons', new_menu, 320, 240),
      (faq.id, 'shop_bestsellers', 'send_message', shop_msg, 320, 400)
    ON CONFLICT (flow_id, node_key) DO UPDATE SET config = EXCLUDED.config, node_type = EXCLUDED.node_type;

    UPDATE flow_nodes
    SET config = jsonb_build_object('next_node_key', 'check_customer')
    WHERE flow_id = faq.id AND node_key = 'start';

    -- 3) First message from a new customer gets the same menu.
    SELECT id INTO welcome_id
    FROM flows
    WHERE account_id = faq.account_id AND name = 'New customer welcome'
    LIMIT 1;

    IF welcome_id IS NULL THEN
      INSERT INTO flows (user_id, account_id, workspace_id, name, description, status, trigger_type, trigger_config, entry_node_id)
      VALUES (
        faq.user_id, faq.account_id, faq.workspace_id,
        'New customer welcome',
        'First message from someone with no Shopify order: Shop Bestsellers, Shipping Info, Talk to Agent.',
        'active', 'first_inbound_message', '{}'::jsonb, 'start'
      )
      RETURNING id INTO welcome_id;
    END IF;

    INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y) VALUES
      (welcome_id, 'start', 'start', jsonb_build_object('next_node_key', 'new_customer_menu'), 0, 0),
      (welcome_id, 'new_customer_menu', 'send_buttons', new_menu, 0, 120),
      (welcome_id, 'shop_bestsellers', 'send_message', shop_msg, -320, 280),
      (welcome_id, 'shipping_info', 'send_message', jsonb_build_object(
        'text', 'We ship orders within 24-48 hours. Delivery takes 3-5 business days depending on your location.',
        'next_node_key', 'any_other_query'
      ), 0, 280),
      (welcome_id, 'any_other_query', 'send_buttons', jsonb_build_object(
        'text', 'Did that answer your question?',
        'buttons', jsonb_build_array(
          jsonb_build_object('reply_id', 'yes_done', 'title', 'Yes, thank you!', 'next_node_key', 'end_nodes'),
          jsonb_build_object('reply_id', 'no_more', 'title', 'Need more help', 'next_node_key', 'agent_handoff')
        )
      ), 0, 440),
      (welcome_id, 'agent_handoff', 'handoff', jsonb_build_object('note', 'New customer asked for an agent from the welcome menu.'), 320, 600),
      (welcome_id, 'end_nodes', 'end', '{}'::jsonb, -320, 600)
    ON CONFLICT (flow_id, node_key) DO UPDATE SET config = EXCLUDED.config, node_type = EXCLUDED.node_type;
  END LOOP;
END $$;

-- 4) B2B Lead capture (name / work email / company) off for shoppers.
UPDATE flows f
SET status = 'draft', updated_at = NOW()
WHERE f.trigger_type = 'first_inbound_message'
  AND f.status = 'active'
  AND f.name <> 'New customer welcome'
  AND EXISTS (
    SELECT 1 FROM flow_nodes n
    WHERE n.flow_id = f.id AND n.node_type = 'collect_input' AND n.config->>'var_key' = 'company'
  );

-- 5) Same menus for future installs of the FAQ template.
UPDATE bot_templates
SET flow_json = '{
  "trigger_type": "keyword",
  "trigger_config": { "keywords": ["hi", "hello", "support", "help"], "match_type": "contains" },
  "entry_node_id": "start",
  "nodes": [
    { "node_key": "start", "node_type": "start", "config": { "next_node_key": "check_customer" } },
    {
      "node_key": "check_customer",
      "node_type": "condition",
      "config": {
        "subject": "contact_field",
        "subject_key": "shopify_order_count",
        "operator": "present",
        "true_next": "faq_list",
        "false_next": "new_customer_menu"
      }
    },
    {
      "node_key": "faq_list",
      "node_type": "send_list",
      "config": {
        "text": "Hello! How can we assist you today?",
        "button_label": "Choose Category",
        "sections": [
          {
            "title": "Support Topics",
            "rows": [
              { "reply_id": "shipping", "title": "Shipping Info", "description": "Delivery times & fees", "next_node_key": "shipping_info" },
              { "reply_id": "human", "title": "Talk to Agent", "description": "Chat with our team", "next_node_key": "agent_handoff" }
            ]
          }
        ]
      }
    },
    {
      "node_key": "new_customer_menu",
      "node_type": "send_buttons",
      "config": {
        "text": "Namaste! 🙏 Welcome to DivyaPrabha Foods. How can we help you today?",
        "buttons": [
          { "reply_id": "shop_bestsellers", "title": "Shop Bestsellers", "next_node_key": "shop_bestsellers" },
          { "reply_id": "shipping", "title": "Shipping Info", "next_node_key": "shipping_info" },
          { "reply_id": "human", "title": "Talk to Agent", "next_node_key": "agent_handoff" }
        ]
      }
    },
    {
      "node_key": "shop_bestsellers",
      "node_type": "send_message",
      "config": {
        "text": "Our bestsellers 🛒\nhttps://divyaprabhafoods.com/collections/all-products",
        "next_node_key": "end_nodes"
      }
    },
    {
      "node_key": "shipping_info",
      "node_type": "send_message",
      "config": {
        "text": "We ship orders within 24-48 hours. Delivery takes 3-5 business days depending on your location.",
        "next_node_key": "any_other_query"
      }
    },
    {
      "node_key": "any_other_query",
      "node_type": "send_buttons",
      "config": {
        "text": "Did that answer your question?",
        "buttons": [
          { "reply_id": "yes_done", "title": "Yes, thank you!", "next_node_key": "end_nodes" },
          { "reply_id": "no_more", "title": "Need more help", "next_node_key": "agent_handoff" }
        ]
      }
    },
    { "node_key": "agent_handoff", "node_type": "handoff", "config": { "note": "Customer requested live support from FAQ Menu." } },
    { "node_key": "end_nodes", "node_type": "end", "config": {} }
  ]
}'::jsonb
WHERE key = 'faq_support';
