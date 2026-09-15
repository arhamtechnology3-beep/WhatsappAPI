-- Persist Meta delivery-failure details so the inbox can show why a
-- template (e.g. to a specific number) never arrived.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS error_message TEXT;
