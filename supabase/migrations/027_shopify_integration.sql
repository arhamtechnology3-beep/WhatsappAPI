-- ============================================================
-- 027_shopify_integration.sql
--
-- Adds the database tables and schemas to support the Shopify store
-- integration: checkouts tracking, orders tracking, webhook logging,
-- and the background WhatsApp send jobs queue.
-- ============================================================

-- 1) Add shopify_customer_id to contacts table if not already present
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_shopify_customer_id ON contacts(shopify_customer_id);

-- 2) Create shopify_checkouts table
CREATE TABLE IF NOT EXISTS shopify_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shopify_checkout_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  customer_phone TEXT,
  customer_email TEXT,
  customer_name TEXT,
  cart_token TEXT,
  abandoned_checkout_url TEXT,
  total_price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  line_items JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recovered', 'abandoned_notified', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_account ON shopify_checkouts(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_checkouts_shopify_id ON shopify_checkouts(shopify_checkout_id);
CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_cart_token ON shopify_checkouts(cart_token);
CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_status ON shopify_checkouts(status);

-- 3) Create shopify_orders table
CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  order_number TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  total_price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  line_items JSONB DEFAULT '[]'::jsonb,
  tracking_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_account ON shopify_orders(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_orders_shopify_id ON shopify_orders(shopify_order_id);

-- 4) Create shopify_webhook_logs table
CREATE TABLE IF NOT EXISTS shopify_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_logs_account ON shopify_webhook_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_logs_topic ON shopify_webhook_logs(topic);

-- 5) Create whatsapp_send_jobs queue table
CREATE TABLE IF NOT EXISTS whatsapp_send_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_params JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_status ON whatsapp_send_jobs(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_run_at ON whatsapp_send_jobs(run_at);

-- 6) Enable RLS
ALTER TABLE shopify_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_send_jobs ENABLE ROW LEVEL SECURITY;

-- 7) RLS Policies
DROP POLICY IF EXISTS shopify_checkouts_select ON shopify_checkouts;
DROP POLICY IF EXISTS shopify_checkouts_insert ON shopify_checkouts;
DROP POLICY IF EXISTS shopify_checkouts_update ON shopify_checkouts;
DROP POLICY IF EXISTS shopify_checkouts_delete ON shopify_checkouts;

CREATE POLICY shopify_checkouts_select ON shopify_checkouts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_checkouts_insert ON shopify_checkouts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_checkouts_update ON shopify_checkouts FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_checkouts_delete ON shopify_checkouts FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS shopify_orders_select ON shopify_orders;
DROP POLICY IF EXISTS shopify_orders_insert ON shopify_orders;
DROP POLICY IF EXISTS shopify_orders_update ON shopify_orders;
DROP POLICY IF EXISTS shopify_orders_delete ON shopify_orders;

CREATE POLICY shopify_orders_select ON shopify_orders FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_orders_insert ON shopify_orders FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_orders_update ON shopify_orders FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_orders_delete ON shopify_orders FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS shopify_webhook_logs_select ON shopify_webhook_logs;
DROP POLICY IF EXISTS shopify_webhook_logs_insert ON shopify_webhook_logs;

CREATE POLICY shopify_webhook_logs_select ON shopify_webhook_logs FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_webhook_logs_insert ON shopify_webhook_logs FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS whatsapp_send_jobs_select ON whatsapp_send_jobs;
DROP POLICY IF EXISTS whatsapp_send_jobs_insert ON whatsapp_send_jobs;
DROP POLICY IF EXISTS whatsapp_send_jobs_update ON whatsapp_send_jobs;
DROP POLICY IF EXISTS whatsapp_send_jobs_delete ON whatsapp_send_jobs;

CREATE POLICY whatsapp_send_jobs_select ON whatsapp_send_jobs FOR SELECT USING (is_account_member(account_id));
CREATE POLICY whatsapp_send_jobs_insert ON whatsapp_send_jobs FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY whatsapp_send_jobs_update ON whatsapp_send_jobs FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY whatsapp_send_jobs_delete ON whatsapp_send_jobs FOR DELETE USING (is_account_member(account_id, 'agent'));

-- 8) Add triggers for updated_at
DROP TRIGGER IF EXISTS set_shopify_checkouts_updated_at ON shopify_checkouts;
CREATE TRIGGER set_shopify_checkouts_updated_at BEFORE UPDATE ON shopify_checkouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_shopify_orders_updated_at ON shopify_orders;
CREATE TRIGGER set_shopify_orders_updated_at BEFORE UPDATE ON shopify_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
