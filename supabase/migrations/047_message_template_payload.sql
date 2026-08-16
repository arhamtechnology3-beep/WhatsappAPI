-- Persist the customer-facing template chrome (header image + CTA buttons)
-- on each outbound message, plus Meta's delivery error text when a send
-- is accepted then marked failed.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS template_payload JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;
