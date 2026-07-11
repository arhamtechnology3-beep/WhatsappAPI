-- ============================================================
-- 032_cashfree_orders_hardening.sql
--
-- Updates cashfree_orders table constraints to support the new state machine
-- (PENDING, PROCESSING, COMPLETED, FAILED, PAID_NOT_CONVERTED)
-- and logs draft order conversion failures for manual review.
-- ============================================================

-- 1) Alter the status check constraint to include PROCESSING and PAID_NOT_CONVERTED
ALTER TABLE cashfree_orders DROP CONSTRAINT IF EXISTS cashfree_orders_status_check;

ALTER TABLE cashfree_orders ADD CONSTRAINT cashfree_orders_status_check 
  CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'FAILED_TO_INITIATE', 'PAID_NOT_CONVERTED'));

-- 2) Add nullable columns for order conversion tracking and logs
ALTER TABLE cashfree_orders ADD COLUMN IF NOT EXISTS converted_shopify_order_id TEXT;
ALTER TABLE cashfree_orders ADD COLUMN IF NOT EXISTS last_error TEXT;
