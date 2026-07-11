-- ============================================================
-- 033_cashfree_config.sql
--
-- Establishes cashfree_config table to store Cashfree API credentials
-- securely in the database, matching the WhatsApp config pattern.
-- ============================================================

CREATE TABLE IF NOT EXISTS cashfree_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL, -- Will store encrypted secret
  environment TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  api_version TEXT NOT NULL DEFAULT '2023-08-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE cashfree_config ENABLE ROW LEVEL SECURITY;

-- Allow service role access for database management
DROP POLICY IF EXISTS "Service role manage cashfree config" ON cashfree_config;
CREATE POLICY "Service role manage cashfree config" ON cashfree_config FOR ALL USING (true);
