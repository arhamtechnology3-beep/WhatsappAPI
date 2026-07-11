-- ============================================================
-- 031_cashfree_orders.sql
--
-- Table to track cashfree checkout sessions, map them to Shopify
-- Draft Orders, and complete them upon successful payment.
-- ============================================================

CREATE TABLE IF NOT EXISTS cashfree_orders (
  order_id TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cart_snapshot JSONB NOT NULL,
  customer_details JSONB NOT NULL,
  shipping_address JSONB NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'FAILED_TO_INITIATE')),
  shopify_draft_order_id TEXT,
  shopify_order_id TEXT,
  discount_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cashfree_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies matching wacrm conventions
DROP POLICY IF EXISTS cashfree_orders_select ON cashfree_orders;
DROP POLICY IF EXISTS cashfree_orders_insert ON cashfree_orders;
DROP POLICY IF EXISTS cashfree_orders_update ON cashfree_orders;
DROP POLICY IF EXISTS cashfree_orders_delete ON cashfree_orders;

CREATE POLICY cashfree_orders_select ON cashfree_orders FOR SELECT USING (is_account_member(account_id));
CREATE POLICY cashfree_orders_insert ON cashfree_orders FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY cashfree_orders_update ON cashfree_orders FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY cashfree_orders_delete ON cashfree_orders FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS set_cashfree_orders_updated_at ON cashfree_orders;
CREATE TRIGGER set_cashfree_orders_updated_at BEFORE UPDATE ON cashfree_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
