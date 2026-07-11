-- ============================================================
-- 034_conversation_sources.sql
--
-- Establishes table and database functions for Click to WhatsApp (CTWA)
-- attribution and marketing insights.
-- ============================================================

-- 1) Create conversation_sources table
CREATE TABLE IF NOT EXISTS conversation_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('instagram', 'facebook_post', 'facebook_ads', 'google', 'other')),
  source_id TEXT,
  source_url TEXT,
  headline TEXT,
  body TEXT,
  ctwa_clid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for lookup speed and consistency
CREATE INDEX IF NOT EXISTS idx_conversation_sources_account ON conversation_sources(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_sources_contact ON conversation_sources(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sources_channel ON conversation_sources(source_channel);

-- Enable RLS
ALTER TABLE conversation_sources ENABLE ROW LEVEL SECURITY;

-- 2) RLS Policies
DROP POLICY IF EXISTS conversation_sources_select ON conversation_sources;
DROP POLICY IF EXISTS conversation_sources_all ON conversation_sources;

CREATE POLICY conversation_sources_select ON conversation_sources
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY conversation_sources_all ON conversation_sources
  FOR ALL USING (is_account_member(account_id));

-- 3) Build ctwa_insights_summary RPC function
CREATE OR REPLACE FUNCTION ctwa_insights_summary(
  tenant_id UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  source_channel TEXT,
  total_conversations BIGINT,
  carts_recovered BIGINT,
  revenue_recovered NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH channels AS (
    SELECT unnest(ARRAY['instagram', 'facebook_post', 'facebook_ads', 'google', 'other']) AS channel
  ),
  stats AS (
    SELECT
      cs.source_channel AS channel,
      COUNT(DISTINCT cs.contact_id) AS conversations,
      COUNT(DISTINCT o.id) AS recovered,
      COALESCE(SUM(o.total_price), 0) AS revenue
    FROM conversation_sources cs
    -- Join shopify_orders where the order's contact matches a conversation_source contact,
    -- and the order's created_at falls after the conversation started
    LEFT JOIN shopify_orders o ON cs.contact_id = o.contact_id
      AND o.created_at >= cs.created_at
      AND o.account_id = tenant_id
    WHERE cs.account_id = tenant_id
      AND cs.created_at >= start_date
      AND cs.created_at <= end_date
    GROUP BY cs.source_channel
  )
  SELECT
    c.channel::TEXT AS source_channel,
    COALESCE(s.conversations, 0)::BIGINT AS total_conversations,
    COALESCE(s.recovered, 0)::BIGINT AS carts_recovered,
    COALESCE(s.revenue, 0)::NUMERIC AS revenue_recovered
  FROM channels c
  LEFT JOIN stats s ON c.channel = s.channel;
END;
$$;

-- 4) Build ctwa_daily_trend RPC function
CREATE OR REPLACE FUNCTION ctwa_daily_trend(
  tenant_id UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  trend_date TEXT,
  source_channel TEXT,
  conversation_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(cs.created_at, 'YYYY-MM-DD') AS trend_date,
    cs.source_channel,
    COUNT(cs.id)::BIGINT AS conversation_count
  FROM conversation_sources cs
  WHERE cs.account_id = tenant_id
    AND cs.created_at >= start_date
    AND cs.created_at <= end_date
  GROUP BY 1, cs.source_channel
  ORDER BY 1 ASC, cs.source_channel ASC;
END;
$$;
