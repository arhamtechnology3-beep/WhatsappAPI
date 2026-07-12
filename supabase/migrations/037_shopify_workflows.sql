-- ============================================================
-- 037_shopify_workflows.sql
--
-- Migration to support Shopify settings config, workflows catalog,
-- and execution logging table.
-- ============================================================

-- 1) Create workflow_categories table
CREATE TABLE IF NOT EXISTS workflow_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Create workflow_templates table
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES workflow_categories(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  default_message_template TEXT NOT NULL,
  delay_minutes INTEGER,
  display_order INTEGER NOT NULL,
  meta_template_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Create merchant_workflows table
CREATE TABLE IF NOT EXISTS merchant_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_configured', 'configured', 'active', 'paused')),
  message_template TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, workflow_template_id)
);

-- 4) Create workflow_logs table
CREATE TABLE IF NOT EXISTS workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workflow_template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5) Add workflow_log_id to whatsapp_send_jobs queue
ALTER TABLE whatsapp_send_jobs
  ADD COLUMN IF NOT EXISTS workflow_log_id UUID REFERENCES workflow_logs(id) ON DELETE SET NULL;

-- 6) Enable RLS
ALTER TABLE workflow_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

-- 7) RLS Policies
DROP POLICY IF EXISTS workflow_categories_select ON workflow_categories;
CREATE POLICY workflow_categories_select ON workflow_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS workflow_templates_select ON workflow_templates;
CREATE POLICY workflow_templates_select ON workflow_templates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS merchant_workflows_all ON merchant_workflows;
CREATE POLICY merchant_workflows_all ON merchant_workflows
  FOR ALL USING (is_account_member(merchant_id));

DROP POLICY IF EXISTS workflow_logs_select ON workflow_logs;
CREATE POLICY workflow_logs_select ON workflow_logs
  FOR SELECT USING (is_account_member(account_id));

-- 8) Seed Categories
INSERT INTO workflow_categories (key, name, icon, display_order) VALUES
  ('abandoned_cart', 'Abandoned Cart', 'shopping-cart', 1),
  ('order', 'Order Alerts', 'package', 2),
  ('fulfillment_tracking', 'Fulfillment & Tracking', 'truck', 3),
  ('payment_refund', 'Payment & Refund', 'credit-card', 4)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- 9) Seed Workflow Templates
-- Helper subquery to resolve category IDs
INSERT INTO workflow_templates (category_id, key, name, description, trigger_event, default_message_template, delay_minutes, display_order, meta_template_name) VALUES
  (
    (SELECT id FROM workflow_categories WHERE key = 'abandoned_cart'),
    'cart_reminder_1h',
    'Reminder 1',
    'Recover abandoned carts with a first automated WhatsApp reminder.',
    'cart_abandoned_1h',
    'Hey {{customer_name}}! 😉 Still thinking about {{product_name}}? We saw you checking it out and saved it in your cart at {{store_name}}! Grab it now before it sells out. 👉 Click below to complete checkout: {{checkout_url}}',
    60,
    1,
    'wacrm_cart_abandoned_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'abandoned_cart'),
    'cart_reminder_24h',
    'Reminder 2',
    'Send a follow-up WhatsApp reminder if the cart is still abandoned.',
    'cart_abandoned_24h',
    'Hey {{customer_name}}! 🤔 Still thinking about {{product_name}}? Your cart is waiting for you! Order today at only ₹{{total_price}}.',
    1440,
    2,
    'wacrm_cart_reminder_step2_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'abandoned_cart'),
    'cart_reminder_72h',
    'Reminder 3',
    'Send a final WhatsApp reminder to recover the abandoned cart.',
    'cart_abandoned_72h',
    'Hey {{customer_name}}! 🎁 Still thinking about {{product_name}}? Complete your order here: {{checkout_url}} and use code WELCOME10 for a special 10% OFF!',
    4320,
    3,
    'wacrm_cart_reminder_step3_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'order'),
    'order_confirmation',
    'Order Confirmation',
    'Send transactional confirmation alerts immediately after an order is placed.',
    'order_created',
    'Hey {{customer_name}}! Woohoo! 🎉 Your order #{{order_number}} of ₹{{total_price}} is confirmed! We are preparing your treats with love. We''ll send tracking details when it ships! 🚚',
    0,
    1,
    'wacrm_order_confirmed_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'order'),
    'order_cancelled',
    'Order Cancelled',
    'Notify customer when an order is voided or cancelled.',
    'order_cancelled',
    'Hi {{customer_name}}, your order #{{order_number}} has been cancelled. If this was a mistake, please reach out to us.',
    0,
    2,
    'wacrm_order_cancelled_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'order'),
    'cod_confirmation',
    'COD Confirmation Request',
    'Collect WhatsApp button confirmations for cash-on-delivery orders.',
    'order_created',
    'Hey {{customer_name}}! 😍 Your order #{{order_number}} of ₹{{total_price}} is ready to ship. Please confirm your COD order below!',
    0,
    3,
    'wacrm_cod_confirmation_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'order_shipped',
    'Order Shipped',
    'Send dispatch notifications with a live tracking link.',
    'fulfillment_shipped',
    'Great news, {{customer_name}}! 🚚 Your order #{{order_number}} is on its way! Track your package here: {{tracking_url}}',
    0,
    1,
    'wacrm_order_shipped_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'out_for_delivery',
    'Out for Delivery',
    'Alert customer when delivery agent is en route with the parcel.',
    'out_for_delivery',
    'Hi {{customer_name}}, order #{{order_number}} is out for delivery today! Keep your phone handy.',
    0,
    2,
    'wacrm_out_for_delivery_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'delivered',
    'Delivered',
    'Send post-delivery success confirmation messages.',
    'delivered',
    'Hey {{customer_name}}! Delivered! 🎁 Your order #{{order_number}} has been successfully delivered. We hope you love it!',
    0,
    3,
    'wacrm_order_delivered_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'delivery_delayed',
    'Delivery Delayed',
    'Proactively notify customer of transit delays.',
    'delivery_delayed',
    'Hi {{customer_name}}, shipping for order #{{order_number}} has been delayed. We are working hard to resolve this!',
    0,
    4,
    'wacrm_delivery_delayed_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'return_initiated',
    'Return Initiated',
    'Confirm return request registration.',
    'return_initiated',
    'Hi {{customer_name}}, your return request for order #{{order_number}} has been registered successfully.',
    0,
    5,
    'wacrm_return_initiated_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'fulfillment_tracking'),
    'return_picked_up',
    'Return Picked Up',
    'Confirm courier pickup of return items.',
    'return_picked_up',
    'Hi {{customer_name}}, your return package for order #{{order_number}} has been picked up.',
    0,
    6,
    'wacrm_return_picked_up_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'payment_refund'),
    'payment_received',
    'Payment Received',
    'Send invoice notifications once payment is cleared.',
    'payment_received',
    'Hi {{customer_name}}, we have received payment for order #{{order_number}}! Thank you.',
    0,
    1,
    'wacrm_payment_received_v1'
  ),
  (
    (SELECT id FROM workflow_categories WHERE key = 'payment_refund'),
    'refund_processed',
    'Refund Processed',
    'Notify customer when a billing refund has been processed.',
    'payment_refunded',
    'Hi {{customer_name}}, a refund of ₹{{total_price}} has been processed for order #{{order_number}}.',
    0,
    2,
    'wacrm_refund_processed_v1'
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_event = EXCLUDED.trigger_event,
  default_message_template = EXCLUDED.default_message_template,
  delay_minutes = EXCLUDED.delay_minutes,
  display_order = EXCLUDED.display_order,
  meta_template_name = EXCLUDED.meta_template_name;
