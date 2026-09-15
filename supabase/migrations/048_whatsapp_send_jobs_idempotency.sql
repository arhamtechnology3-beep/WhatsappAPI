-- Prevent duplicate order WhatsApp on Shopify webhook retries,
-- and keep a stable key for "already sent this template for this order".

ALTER TABLE whatsapp_send_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_idempotency
  ON whatsapp_send_jobs (account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
