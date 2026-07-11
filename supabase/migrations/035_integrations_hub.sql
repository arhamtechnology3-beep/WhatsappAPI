-- ============================================================
-- 035_integrations_hub.sql
--
-- Database tables to support the Integrations Hub: integrations metadata,
-- merchant configurations (secrets encrypted application-side), and generic webhooks.
-- ============================================================

-- 1) Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  category TEXT NOT NULL,
  is_active_by_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Create merchant_integrations table
CREATE TABLE IF NOT EXISTS merchant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  integration_key TEXT NOT NULL REFERENCES integrations(key) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('connected', 'disconnected', 'error')),
  config JSONB DEFAULT '{}'::jsonb,
  connection_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_integrations_account ON merchant_integrations(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_integrations_account_key ON merchant_integrations(account_id, integration_key);

-- 3) Create webhook_endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  target_url TEXT,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_account ON webhook_endpoints(account_id);

-- 4) Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- 5) RLS Policies
DROP POLICY IF EXISTS integrations_select ON integrations;
CREATE POLICY integrations_select ON integrations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS merchant_integrations_select ON merchant_integrations;
DROP POLICY IF EXISTS merchant_integrations_all ON merchant_integrations;

CREATE POLICY merchant_integrations_select ON merchant_integrations
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY merchant_integrations_all ON merchant_integrations
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS webhook_endpoints_select ON webhook_endpoints;
DROP POLICY IF EXISTS webhook_endpoints_all ON webhook_endpoints;

CREATE POLICY webhook_endpoints_select ON webhook_endpoints
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY webhook_endpoints_all ON webhook_endpoints
  FOR ALL USING (is_account_member(account_id, 'agent'));

-- 6) Seed integrations data
INSERT INTO integrations (key, name, description, category, is_active_by_default) VALUES
  ('generic_webhook', 'Generic Webhook', 'Trigger WhatsApp messages from an external system using webhook.', 'developer', false),
  ('shopify', 'Shopify', 'Send Order notifications to your customers and also boost cart recoveries.', 'ecommerce', true),
  ('razorpay', 'Razorpay', 'Send Payment notifications and subscription alerts to your customers.', 'payments', false),
  ('shiprocket', 'Shiprocket', 'Send Order updates to your customer on WhatsApp for better experience.', 'logistics', false),
  ('cashfree', 'Cashfree', 'Send Payment links, capture refunds, and update order statuses automatically via Cashfree.', 'payments', false)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active_by_default = EXCLUDED.is_active_by_default;

-- 7) Add updated_at trigger for merchant_integrations
DROP TRIGGER IF EXISTS set_merchant_integrations_updated_at ON merchant_integrations;
CREATE TRIGGER set_merchant_integrations_updated_at BEFORE UPDATE ON merchant_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
