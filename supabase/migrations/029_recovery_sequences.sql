-- ============================================================
-- 029_recovery_sequences.sql
--
-- Implements Phase 2.6 multi-step recovery sequences, steps,
-- recovery tracking state table, and whatsapp_marketing_opt_in.
-- ============================================================

-- 1) Add whatsapp_marketing_opt_in to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 2) Create shopify_automation_sequences table
CREATE TABLE IF NOT EXISTS shopify_automation_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cart_abandoned', 'browse_abandoned')),
  sequence_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, trigger_type)
);

-- 3) Create shopify_automation_sequence_steps table
CREATE TABLE IF NOT EXISTS shopify_automation_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES shopify_automation_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 1 AND step_order <= 3),
  delay_minutes_from_previous_step INTEGER NOT NULL DEFAULT 0,
  template_name TEXT NOT NULL,
  template_variable_mapping JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_approval_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (meta_approval_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sequence_id, step_order)
);

-- 4) Create shopify_recovery_tracking table
CREATE TABLE IF NOT EXISTS shopify_recovery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  shopify_checkout_id UUID REFERENCES shopify_checkouts(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES shopify_automation_sequences(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'converted', 'stopped', 'completed')),
  next_send_at TIMESTAMPTZ NOT NULL,
  discount_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_shopify_automation_sequences_account ON shopify_automation_sequences(account_id);
CREATE INDEX IF NOT EXISTS idx_shopify_automation_sequence_steps_seq ON shopify_automation_sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_shopify_recovery_tracking_account ON shopify_recovery_tracking(account_id);
CREATE INDEX IF NOT EXISTS idx_shopify_recovery_tracking_contact ON shopify_recovery_tracking(contact_id);
CREATE INDEX IF NOT EXISTS idx_shopify_recovery_tracking_checkout ON shopify_recovery_tracking(shopify_checkout_id);
CREATE INDEX IF NOT EXISTS idx_shopify_recovery_tracking_status ON shopify_recovery_tracking(status);

-- Enable RLS
ALTER TABLE shopify_automation_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_automation_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_recovery_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS shopify_automation_sequences_select ON shopify_automation_sequences;
DROP POLICY IF EXISTS shopify_automation_sequences_insert ON shopify_automation_sequences;
DROP POLICY IF EXISTS shopify_automation_sequences_update ON shopify_automation_sequences;
DROP POLICY IF EXISTS shopify_automation_sequences_delete ON shopify_automation_sequences;

CREATE POLICY shopify_automation_sequences_select ON shopify_automation_sequences FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_automation_sequences_insert ON shopify_automation_sequences FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_automation_sequences_update ON shopify_automation_sequences FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_automation_sequences_delete ON shopify_automation_sequences FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS shopify_automation_sequence_steps_select ON shopify_automation_sequence_steps;
DROP POLICY IF EXISTS shopify_automation_sequence_steps_insert ON shopify_automation_sequence_steps;
DROP POLICY IF EXISTS shopify_automation_sequence_steps_update ON shopify_automation_sequence_steps;
DROP POLICY IF EXISTS shopify_automation_sequence_steps_delete ON shopify_automation_sequence_steps;

CREATE POLICY shopify_automation_sequence_steps_select ON shopify_automation_sequence_steps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM shopify_automation_sequences s
    WHERE s.id = sequence_id AND is_account_member(s.account_id)
  )
);
CREATE POLICY shopify_automation_sequence_steps_insert ON shopify_automation_sequence_steps FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM shopify_automation_sequences s
    WHERE s.id = sequence_id AND is_account_member(s.account_id, 'agent')
  )
);
CREATE POLICY shopify_automation_sequence_steps_update ON shopify_automation_sequence_steps FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM shopify_automation_sequences s
    WHERE s.id = sequence_id AND is_account_member(s.account_id, 'agent')
  )
);
CREATE POLICY shopify_automation_sequence_steps_delete ON shopify_automation_sequence_steps FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM shopify_automation_sequences s
    WHERE s.id = sequence_id AND is_account_member(s.account_id, 'agent')
  )
);

DROP POLICY IF EXISTS shopify_recovery_tracking_select ON shopify_recovery_tracking;
DROP POLICY IF EXISTS shopify_recovery_tracking_insert ON shopify_recovery_tracking;
DROP POLICY IF EXISTS shopify_recovery_tracking_update ON shopify_recovery_tracking;
DROP POLICY IF EXISTS shopify_recovery_tracking_delete ON shopify_recovery_tracking;

CREATE POLICY shopify_recovery_tracking_select ON shopify_recovery_tracking FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shopify_recovery_tracking_insert ON shopify_recovery_tracking FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_recovery_tracking_update ON shopify_recovery_tracking FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY shopify_recovery_tracking_delete ON shopify_recovery_tracking FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_shopify_automation_sequences_updated_at ON shopify_automation_sequences;
CREATE TRIGGER set_shopify_automation_sequences_updated_at BEFORE UPDATE ON shopify_automation_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_shopify_automation_sequence_steps_updated_at ON shopify_automation_sequence_steps;
CREATE TRIGGER set_shopify_automation_sequence_steps_updated_at BEFORE UPDATE ON shopify_automation_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_shopify_recovery_tracking_updated_at ON shopify_recovery_tracking;
CREATE TRIGGER set_shopify_recovery_tracking_updated_at BEFORE UPDATE ON shopify_recovery_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function and trigger to seed sequences & steps for new accounts
CREATE OR REPLACE FUNCTION seed_shopify_automation_sequences()
RETURNS TRIGGER AS $$
DECLARE
  cart_seq_id UUID;
  browse_seq_id UUID;
BEGIN
  -- Insert cart abandoned sequence
  INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
  VALUES (NEW.id, 'cart_abandoned', 'Cart Abandonment Recovery', false)
  RETURNING id INTO cart_seq_id;

  -- Insert steps for cart abandoned
  INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping)
  VALUES
    (cart_seq_id, 1, 30, 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb),
    (cart_seq_id, 2, 1440, 'wacrm_cart_reminder_step2_v1', '["customer_name", "product_name", "total_price"]'::jsonb),
    (cart_seq_id, 3, 1440, 'wacrm_cart_reminder_step3_v1', '["customer_name", "product_name", "checkout_url", "discount_code"]'::jsonb);

  -- Insert browse abandoned sequence
  INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
  VALUES (NEW.id, 'browse_abandoned', 'Browse Abandonment Recovery', false)
  RETURNING id INTO browse_seq_id;

  -- Insert steps for browse abandoned
  INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping)
  VALUES
    (browse_seq_id, 1, 30, 'wacrm_browse_abandoned_v1', '["customer_name", "product_name", "total_price", "product_url"]'::jsonb);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_shopify_automation_sequences ON accounts;
CREATE TRIGGER trg_seed_shopify_automation_sequences
AFTER INSERT ON accounts
FOR EACH ROW
EXECUTE FUNCTION seed_shopify_automation_sequences();

-- Seed for existing accounts
DO $$
DECLARE
  acc RECORD;
  cart_seq_id UUID;
  browse_seq_id UUID;
BEGIN
  FOR acc IN SELECT id FROM accounts LOOP
    -- Insert cart sequence
    IF NOT EXISTS (
      SELECT 1 FROM shopify_automation_sequences
      WHERE account_id = acc.id AND trigger_type = 'cart_abandoned'
    ) THEN
      INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
      VALUES (acc.id, 'cart_abandoned', 'Cart Abandonment Recovery', false)
      RETURNING id INTO cart_seq_id;

      INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping)
      VALUES
        (cart_seq_id, 1, 30, 'wacrm_cart_abandoned_v1', '["customer_name", "product_name", "store_name", "checkout_url"]'::jsonb),
        (cart_seq_id, 2, 1440, 'wacrm_cart_reminder_step2_v1', '["customer_name", "product_name", "total_price"]'::jsonb),
        (cart_seq_id, 3, 1440, 'wacrm_cart_reminder_step3_v1', '["customer_name", "product_name", "checkout_url", "discount_code"]'::jsonb);
    END IF;

    -- Insert browse sequence
    IF NOT EXISTS (
      SELECT 1 FROM shopify_automation_sequences
      WHERE account_id = acc.id AND trigger_type = 'browse_abandoned'
    ) THEN
      INSERT INTO shopify_automation_sequences (account_id, trigger_type, sequence_name, is_active)
      VALUES (acc.id, 'browse_abandoned', 'Browse Abandonment Recovery', false)
      RETURNING id INTO browse_seq_id;

      INSERT INTO shopify_automation_sequence_steps (sequence_id, step_order, delay_minutes_from_previous_step, template_name, template_variable_mapping)
      VALUES
        (browse_seq_id, 1, 30, 'wacrm_browse_abandoned_v1', '["customer_name", "product_name", "total_price", "product_url"]'::jsonb);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
