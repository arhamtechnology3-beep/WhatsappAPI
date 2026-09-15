-- Customer-facing WhatsApp copy should never use the *.myshopify.com host.
UPDATE message_templates
SET
  body_text = replace(
    replace(body_text, 'https://divyaprabhafoods.myshopify.com', 'https://divyaprabhafoods.com'),
    'divyaprabhafoods.myshopify.com',
    'divyaprabhafoods.com'
  ),
  footer_text = CASE
    WHEN footer_text IS NULL THEN NULL
    ELSE replace(
      replace(footer_text, 'https://divyaprabhafoods.myshopify.com', 'https://divyaprabhafoods.com'),
      'divyaprabhafoods.myshopify.com',
      'divyaprabhafoods.com'
    )
  END,
  buttons = CASE
    WHEN buttons IS NULL THEN NULL
    ELSE replace(
      replace(buttons::text, 'https://divyaprabhafoods.myshopify.com', 'https://divyaprabhafoods.com'),
      'divyaprabhafoods.myshopify.com',
      'divyaprabhafoods.com'
    )::jsonb
  END,
  updated_at = NOW()
WHERE
  coalesce(body_text, '') ILIKE '%myshopify.com%'
  OR coalesce(footer_text, '') ILIKE '%myshopify.com%'
  OR coalesce(buttons::text, '') ILIKE '%myshopify.com%';

UPDATE shopify_checkouts
SET abandoned_checkout_url = replace(
  abandoned_checkout_url,
  'divyaprabhafoods.myshopify.com',
  'divyaprabhafoods.com'
)
WHERE abandoned_checkout_url ILIKE '%myshopify.com%';
