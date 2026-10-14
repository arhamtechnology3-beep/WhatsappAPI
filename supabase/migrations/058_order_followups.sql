-- After-delivery WhatsApp follow-ups, one row per delivered Shopify order:
--   review_request   delivered + 24h
--   review_reminder  request + 72h, only for products whose review link was not opened
--   refill           delivered + 30 days, skipped if the customer ordered again
--   refill_followup  delivered + 45 days, same skip
-- `products` holds every distinct product of the order with its review link
-- and the time the customer opened it (from /review/<token>).

CREATE TABLE IF NOT EXISTS order_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  order_number TEXT,
  order_created_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage TEXT NOT NULL
    CHECK (stage IN ('review_request', 'review_reminder', 'refill', 'refill_followup', 'done')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  next_run_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_opened_at TIMESTAMPTZ,
  reorder_clicked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_followups_due
  ON order_followups (next_run_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_order_followups_contact
  ON order_followups (contact_id);

ALTER TABLE order_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_followups_select ON order_followups;
DROP POLICY IF EXISTS order_followups_update ON order_followups;
CREATE POLICY order_followups_select ON order_followups
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY order_followups_update ON order_followups
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

-- "Stop reminders" (or STOP) on a refill message. Separate from
-- marketing_opt_out_at, which Shopify checkout also sets when the
-- email-offers box is left unticked.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS reorder_reminders_off_at TIMESTAMPTZ;
