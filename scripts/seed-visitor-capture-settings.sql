-- Enable visitor capture + nudges for DivyaPrabha (run in Supabase SQL Editor).
-- Creates/updates visitor_capture_settings for every store whose shop_domain
-- looks like divyaprabha. Adjust whatsapp_number / discount_code if needed.
-- Prerequisite: migration 059 applied; create Shopify discount DP10 first.

INSERT INTO visitor_capture_settings (
  store_id,
  organization_id,
  popup_enabled,
  popup_delay_seconds,
  offer_text,
  discount_code,
  whatsapp_number,
  policy_version,
  browse_nudge_enabled,
  cart_nudge_enabled,
  visit_nudge_enabled,
  max_marketing_per_24h,
  browse_visit_cooldown_days,
  skip_recent_buyer_days,
  inactivity_min_minutes,
  inactivity_max_minutes,
  updated_at
)
SELECT
  s.id,
  s.organization_id,
  TRUE,
  25,
  'Unlock 10% OFF on WhatsApp',
  'DP10',
  -- Business WhatsApp digits only (no +). Override if wrong:
  COALESCE(
    NULLIF(regexp_replace(wc.display_phone_number, '\D', '', 'g'), ''),
    NULLIF(regexp_replace(wc.phone_number_id, '\D', '', 'g'), '')
  ),
  'v1',
  TRUE,
  TRUE,
  TRUE,
  1,
  7,
  3,
  60,
  120,
  NOW()
FROM stores s
LEFT JOIN whatsapp_config wc
  ON wc.account_id::text = s.organization_id::text
  OR wc.account_id IN (
    SELECT a.id FROM accounts a
    WHERE a.id::text = s.organization_id::text
       OR a.owner_user_id::text = s.organization_id::text
  )
WHERE s.shop_domain ILIKE '%divyaprabha%'
   OR s.name ILIKE '%divyaprabha%'
ON CONFLICT (store_id) DO UPDATE SET
  popup_enabled = EXCLUDED.popup_enabled,
  popup_delay_seconds = EXCLUDED.popup_delay_seconds,
  offer_text = EXCLUDED.offer_text,
  discount_code = EXCLUDED.discount_code,
  whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, visitor_capture_settings.whatsapp_number),
  browse_nudge_enabled = EXCLUDED.browse_nudge_enabled,
  cart_nudge_enabled = EXCLUDED.cart_nudge_enabled,
  visit_nudge_enabled = EXCLUDED.visit_nudge_enabled,
  updated_at = NOW();

-- Sanity check
SELECT
  s.shop_domain,
  v.popup_enabled,
  v.discount_code,
  v.whatsapp_number,
  v.browse_nudge_enabled,
  v.cart_nudge_enabled,
  v.visit_nudge_enabled
FROM visitor_capture_settings v
JOIN stores s ON s.id = v.store_id;
