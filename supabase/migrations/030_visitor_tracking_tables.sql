-- ============================================================
-- 030_visitor_tracking_tables.sql
--
-- Creates visitor_sessions and visitor_identity_map tables used
-- by visitor-identifier.js on the Shopify storefront.
-- These tables use the Supabase anon key (not service_role) so
-- we need RLS policies that allow public INSERT + UPDATE.
-- ============================================================

-- 1) visitor_sessions table
-- Tracks every browsing session: page views, cart events, device info.
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id          TEXT NOT NULL,
  session_id          TEXT NOT NULL UNIQUE,
  device_type         TEXT,
  referrer_source     TEXT,
  utm_params          JSONB,
  device_fingerprint  TEXT,
  session_start       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pages_viewed        JSONB DEFAULT '[]'::jsonb,
  products_viewed     JSONB DEFAULT '[]'::jsonb,
  cart_events         JSONB DEFAULT '[]'::jsonb,
  associated_name     TEXT,
  associated_phone    TEXT,
  associated_email    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id    ON visitor_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_session_id    ON visitor_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_device_fp     ON visitor_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_assoc_phone   ON visitor_sessions(associated_phone);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_session_start ON visitor_sessions(session_start DESC);

-- 2) visitor_identity_map table
-- Maps visitor_id (anonymous) to a real phone/email once captured.
CREATE TABLE IF NOT EXISTS visitor_identity_map (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id       TEXT NOT NULL,
  phone_number     TEXT NOT NULL,
  first_linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(visitor_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_phone   ON visitor_identity_map(phone_number);
CREATE INDEX IF NOT EXISTS idx_visitor_identity_map_visitor ON visitor_identity_map(visitor_id);

-- ============================================================
-- RLS — Enable and open for anon (Shopify storefront writes)
-- ============================================================

ALTER TABLE visitor_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_identity_map   ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "anon_insert_visitor_sessions"      ON visitor_sessions;
DROP POLICY IF EXISTS "anon_update_visitor_sessions"      ON visitor_sessions;
DROP POLICY IF EXISTS "anon_select_visitor_sessions"      ON visitor_sessions;
DROP POLICY IF EXISTS "anon_insert_visitor_identity_map"  ON visitor_identity_map;

-- visitor_sessions: allow anon INSERT (new session creation)
CREATE POLICY "anon_insert_visitor_sessions"
  ON visitor_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

-- visitor_sessions: allow anon UPDATE (page views, cart events, identity enrichment)
CREATE POLICY "anon_update_visitor_sessions"
  ON visitor_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- visitor_sessions: allow anon SELECT (fingerprint lookup to restore visitor_id)
CREATE POLICY "anon_select_visitor_sessions"
  ON visitor_sessions FOR SELECT
  TO anon
  USING (true);

-- visitor_identity_map: allow anon INSERT / upsert
CREATE POLICY "anon_insert_visitor_identity_map"
  ON visitor_identity_map FOR INSERT
  TO anon
  WITH CHECK (true);

-- service_role bypasses RLS by default — no extra policy needed for backend reads.
