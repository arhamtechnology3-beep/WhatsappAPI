-- Enable visitor capture + nudges for DivyaPrabha (run in Supabase SQL Editor).
-- Prerequisite: migration 059 applied; create Shopify discount code DP10 first.
-- Set whatsapp_number to the business WA digits (country code, no +), e.g. 91XXXXXXXXXX.

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
  NULL, -- fill via CRM Visitors → Settings or UPDATE below
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
WHERE s.shop_domain ILIKE '%divyaprabha%'
   OR s.name ILIKE '%divyaprabha%'
ON CONFLICT (store_id) DO UPDATE SET
  popup_enabled = EXCLUDED.popup_enabled,
  popup_delay_seconds = EXCLUDED.popup_delay_seconds,
  offer_text = EXCLUDED.offer_text,
  discount_code = EXCLUDED.discount_code,
  browse_nudge_enabled = EXCLUDED.browse_nudge_enabled,
  cart_nudge_enabled = EXCLUDED.cart_nudge_enabled,
  visit_nudge_enabled = EXCLUDED.visit_nudge_enabled,
  updated_at = NOW();

-- Optional: set the business WhatsApp number once you know digits:
-- UPDATE visitor_capture_settings v
-- SET whatsapp_number = '91XXXXXXXXXX', updated_at = NOW()
-- FROM stores s
-- WHERE s.id = v.store_id
--   AND (s.shop_domain ILIKE '%divyaprabha%' OR s.name ILIKE '%divyaprabha%');

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
