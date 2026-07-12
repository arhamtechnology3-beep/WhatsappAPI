-- ============================================================
-- 036_bot_templates.sql
--
-- Migration to support Template Bot Library:
--   1. Adds template reference column to the `flows` table.
--   2. Creates `bot_templates` table to store pre-built e-commerce chatbot presets.
--   3. Seeds the `bot_templates` table with 6 high-fidelity flow JSONs.
-- ============================================================

-- 1) Add new columns to `flows` table
ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS template_key TEXT;

-- 2) Create bot_templates table
CREATE TABLE IF NOT EXISTS bot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ecommerce', 'support', 'marketing', 'sales')),
  thumbnail_url TEXT,
  flow_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Enable RLS on bot_templates
ALTER TABLE bot_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_templates_select ON bot_templates;
CREATE POLICY bot_templates_select ON bot_templates
  FOR SELECT USING (true);

-- 4) Seed bot_templates data
INSERT INTO bot_templates (key, name, description, category, flow_json) VALUES
  (
    'store_assistant_journey',
    'Store Assistant & Order Journey',
    'Welcome new clients, automatically recover incomplete checkouts for known users, and triage order tracking or delivery status.',
    'ecommerce',
    '{
      "trigger_type": "first_inbound_message",
      "trigger_config": {},
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "check_returning_user" }
        },
        {
          "node_key": "check_returning_user",
          "node_type": "condition",
          "config": {
            "subject": "tag",
            "subject_key": "has_abandoned_cart",
            "operator": "present",
            "true_next": "returning_user_menu",
            "false_next": "new_user_welcome"
          }
        },
        {
          "node_key": "returning_user_menu",
          "node_type": "send_buttons",
          "config": {
            "text": "Welcome back! We noticed you have items pending in your cart. Would you like to complete checkout or track an order?",
            "buttons": [
              { "reply_id": "checkout_now", "title": "Complete Payment", "next_node_key": "send_checkout_link" },
              { "reply_id": "track_now", "title": "Track Order", "next_node_key": "ask_order_no" },
              { "reply_id": "agent_now", "title": "Talk to Agent", "next_node_key": "agent_handoff" }
            ]
          }
        },
        {
          "node_key": "send_checkout_link",
          "node_type": "send_message",
          "config": {
            "text": "Great! Here is your secure checkout link to finish your order: https://divyaprabhafoods.com/checkout. Let us know if you have any questions!",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "ask_order_no",
          "node_type": "collect_input",
          "config": {
            "prompt_text": "Please enter your 6-digit Order ID so we can retrieve your delivery status.",
            "var_key": "order_no",
            "validation": "any",
            "next_node_key": "check_status_msg"
          }
        },
        {
          "node_key": "check_status_msg",
          "node_type": "send_message",
          "config": {
            "text": "Thank you! Checking status for order #{{vars.order_no}}. An agent will connect to assist with your tracking information shortly.",
            "next_node_key": "agent_handoff"
          }
        },
        {
          "node_key": "new_user_welcome",
          "node_type": "send_buttons",
          "config": {
            "text": "Welcome to our store! How can we help you today?",
            "buttons": [
              { "reply_id": "browse", "title": "Browse Products", "next_node_key": "show_products" },
              { "reply_id": "faq", "title": "Shipping & FAQs", "next_node_key": "faq_menu" },
              { "reply_id": "agent", "title": "Talk to Agent", "next_node_key": "agent_handoff" }
            ]
          }
        },
        {
          "node_key": "show_products",
          "node_type": "send_message",
          "config": {
            "text": "Check out our latest collections of traditional snacks and organic sweets here: https://divyaprabhafoods.com/collections/all",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "faq_menu",
          "node_type": "send_message",
          "config": {
            "text": "We deliver within 3-5 business days. Returns are accepted within 7 days of delivery. For other queries, feel free to write here.",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "agent_handoff",
          "node_type": "handoff",
          "config": {
            "note": "Customer needs live assistance regarding cart recovery, order status, or custom store queries."
          }
        },
        {
          "node_key": "end_nodes",
          "node_type": "end",
          "config": {}
        }
      ]
    }'::jsonb
  ),
  (
    'order_tracking',
    'Order Status Tracking',
    'Verify customer order status automatically by collecting order number and checking Shopify records.',
    'ecommerce',
    '{
      "trigger_type": "keyword",
      "trigger_config": { "keywords": ["order", "status", "track"], "match_type": "contains" },
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "greeting_menu" }
        },
        {
          "node_key": "greeting_menu",
          "node_type": "send_buttons",
          "config": {
            "text": "Hi! Welcome to order tracking. Would you like to check your order status?",
            "footer_text": "Select an option below",
            "buttons": [
              { "reply_id": "check_status", "title": "Check Status", "next_node_key": "ask_order_no" },
              { "reply_id": "other_queries", "title": "Other Query", "next_node_key": "agent_handoff" }
            ]
          }
        },
        {
          "node_key": "ask_order_no",
          "node_type": "collect_input",
          "config": {
            "prompt_text": "Please reply with your 6-digit Order ID (e.g. 1004).",
            "var_key": "order_no",
            "validation": "any",
            "next_node_key": "processing_msg"
          }
        },
        {
          "node_key": "processing_msg",
          "node_type": "send_message",
          "config": {
            "text": "Checking details for order #{{vars.order_no}} in our system. One moment...",
            "next_node_key": "agent_handoff"
          }
        },
        {
          "node_key": "agent_handoff",
          "node_type": "handoff",
          "config": {
            "note": "Customer is tracking order #{{vars.order_no}}. Please look it up in Shopify and reply."
          }
        }
      ]
    }'::jsonb
  ),
  (
    'cart_recovery',
    'Abandoned Cart Follow-up',
    'Boost sales by sending personalized cart reminders and offering quick checkout links.',
    'marketing',
    '{
      "trigger_type": "manual",
      "trigger_config": {},
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "remind_cart" }
        },
        {
          "node_key": "remind_cart",
          "node_type": "send_buttons",
          "config": {
            "text": "Hi! We noticed you left some items in your shopping cart. Ready to complete your order?",
            "footer_text": "Choose an option",
            "buttons": [
              { "reply_id": "checkout_now", "title": "Complete Order", "next_node_key": "send_checkout_link" },
              { "reply_id": "no_thanks", "title": "No, thanks", "next_node_key": "end_nodes" }
            ]
          }
        },
        {
          "node_key": "send_checkout_link",
          "node_type": "send_message",
          "config": {
            "text": "Awesome! Use this link to secure your items and checkout: https://divyaprabhafoods.com/checkout. Let us know if you need anything!",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "end_nodes",
          "node_type": "end",
          "config": {}
        }
      ]
    }'::jsonb
  ),
  (
    'faq_support',
    'FAQ / Support Handoff',
    'Automatically answer common customer queries (shipping, returns) before routing to live chat.',
    'support',
    '{
      "trigger_type": "keyword",
      "trigger_config": { "keywords": ["hi", "hello", "support", "help"], "match_type": "contains" },
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "faq_list" }
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
                  { "reply_id": "returns", "title": "Returns & Refund", "description": "Easy return policy", "next_node_key": "return_info" },
                  { "reply_id": "human", "title": "Talk to Agent", "description": "Connect with our team", "next_node_key": "agent_handoff" }
                ]
              }
            ]
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
          "node_key": "return_info",
          "node_type": "send_message",
          "config": {
            "text": "We offer a 7-day hassle-free return policy. Items must be unused and in original packaging.",
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
        {
          "node_key": "agent_handoff",
          "node_type": "handoff",
          "config": { "note": "Customer requested live support from FAQ Menu." }
        },
        {
          "node_key": "end_nodes",
          "node_type": "end",
          "config": {}
        }
      ]
    }'::jsonb
  ),
  (
    'product_recommendation',
    'Product Recommendation',
    'Recommend relevant products based on category selection to drive conversion.',
    'sales',
    '{
      "trigger_type": "keyword",
      "trigger_config": { "keywords": ["shop", "buy", "products", "items"], "match_type": "contains" },
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "ask_category" }
        },
        {
          "node_key": "ask_category",
          "node_type": "send_buttons",
          "config": {
            "text": "Welcome to our store! Which category are you shopping for today?",
            "buttons": [
              { "reply_id": "cat_snacks", "title": "Healthy Snacks", "next_node_key": "show_snacks" },
              { "reply_id": "cat_sweets", "title": "Traditional Sweets", "next_node_key": "show_sweets" }
            ]
          }
        },
        {
          "node_key": "show_snacks",
          "node_type": "send_message",
          "config": {
            "text": "Great choice! We recommend our bestselling roasted nuts and seeds. View full list here: https://divyaprabhafoods.com/collections/snacks",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "show_sweets",
          "node_type": "send_message",
          "config": {
            "text": "Indulge in our classic sweets made with organic jaggery! View sweets: https://divyaprabhafoods.com/collections/sweets",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "end_nodes",
          "node_type": "end",
          "config": {}
        }
      ]
    }'::jsonb
  ),
  (
    'cod_confirmation',
    'COD Order Confirmation',
    'Verify Cash on Delivery orders instantly via WhatsApp to reduce return-to-origin (RTO) rates.',
    'ecommerce',
    '{
      "trigger_type": "manual",
      "trigger_config": {},
      "entry_node_id": "start",
      "nodes": [
        {
          "node_key": "start",
          "node_type": "start",
          "config": { "next_node_key": "confirm_message" }
        },
        {
          "node_key": "confirm_message",
          "node_type": "send_buttons",
          "config": {
            "text": "Hi! Thank you for your Cash on Delivery order. Please confirm if you would like to proceed with the delivery.",
            "buttons": [
              { "reply_id": "cod_yes", "title": "Confirm Order", "next_node_key": "tag_confirmed" },
              { "reply_id": "cod_no", "title": "Cancel Order", "next_node_key": "tag_cancelled" }
            ]
          }
        },
        {
          "node_key": "tag_confirmed",
          "node_type": "send_message",
          "config": {
            "text": "Thank you! Your Cash on Delivery order has been confirmed and is being prepared for shipping.",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "tag_cancelled",
          "node_type": "send_message",
          "config": {
            "text": "Your order has been cancelled as per your request. If this was a mistake, please reach out to us.",
            "next_node_key": "end_nodes"
          }
        },
        {
          "node_key": "end_nodes",
          "node_type": "end",
          "config": {}
        }
      ]
    }'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  flow_json = EXCLUDED.flow_json;
