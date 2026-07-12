-- ============================================================
-- 038_whatsapp_marketing_opt_in.sql
--
-- Migration to support WhatsApp marketing opt-in tracking,
-- audit log, and configuration variables.
-- ============================================================

-- 1) Alter contacts table to add new opt-in fields
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT CHECK (marketing_opt_in_source IN ('checkout', 'first_contact_prompt', 'backfill_campaign', 'manual')),
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_in_prompt_sent_at TIMESTAMPTZ;

-- Backfill from existing whatsapp_marketing_opt_in if present
UPDATE contacts SET marketing_opt_in = whatsapp_marketing_opt_in, marketing_opt_in_source = 'manual', marketing_opt_in_at = NOW() WHERE whatsapp_marketing_opt_in IS TRUE;

-- 2) Create opt_in_events table (audit log)
CREATE TABLE IF NOT EXISTS opt_in_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opt_in', 'opt_out')),
  source TEXT NOT NULL,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on opt_in_events
ALTER TABLE opt_in_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opt_in_events_all ON opt_in_events;
CREATE POLICY opt_in_events_all ON opt_in_events
  FOR ALL USING (is_account_member(account_id));

-- 3) Add new opt-in prompt configuration fields to whatsapp_config
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS opt_in_prompt_text TEXT DEFAULT 'Want order updates & offers on WhatsApp? Reply YES to opt in, or STOP anytime to opt out.',
  ADD COLUMN IF NOT EXISTS opt_in_keywords TEXT[] DEFAULT ARRAY['YES', 'Y', 'OPT IN', 'START', 'SUBSCRIBE', 'हाँ', 'હા'],
  ADD COLUMN IF NOT EXISTS opt_out_keywords TEXT[] DEFAULT ARRAY['STOP', 'UNSUBSCRIBE', 'CANCEL', 'STOPIT', 'HALT', 'REMOVE', 'बन्द', 'बंद करें', 'बंद', 'રોકો', 'બંધ કરો', 'બંધ'];

-- 4) Create trigger to automatically keep marketing_opt_in and whatsapp_marketing_opt_in synced
CREATE OR REPLACE FUNCTION sync_contacts_marketing_opt_in()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.marketing_opt_in IS DISTINCT FROM OLD.marketing_opt_in THEN
    NEW.whatsapp_marketing_opt_in := NEW.marketing_opt_in;
    IF NEW.marketing_opt_in IS TRUE THEN
      NEW.marketing_opt_in_at := COALESCE(NEW.marketing_opt_in_at, NOW());
      NEW.marketing_opt_out_at := NULL;
    ELSE
      NEW.marketing_opt_out_at := COALESCE(NEW.marketing_opt_out_at, NOW());
    END IF;
  ELSIF NEW.whatsapp_marketing_opt_in IS DISTINCT FROM OLD.whatsapp_marketing_opt_in THEN
    NEW.marketing_opt_in := NEW.whatsapp_marketing_opt_in;
    IF NEW.marketing_opt_in IS TRUE THEN
      NEW.marketing_opt_in_source := COALESCE(NEW.marketing_opt_in_source, 'manual');
      NEW.marketing_opt_in_at := COALESCE(NEW.marketing_opt_in_at, NOW());
      NEW.marketing_opt_out_at := NULL;
    ELSE
      NEW.marketing_opt_in_source := NULL;
      NEW.marketing_opt_out_at := COALESCE(NEW.marketing_opt_out_at, NOW());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contacts_marketing_opt_in ON contacts;
CREATE TRIGGER trg_sync_contacts_marketing_opt_in
BEFORE INSERT OR UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION sync_contacts_marketing_opt_in();
