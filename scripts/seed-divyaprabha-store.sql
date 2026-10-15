-- Ensure IdentityFlow `stores` row exists for DivyaPrabha (Supabase SQL Editor).
-- Needed when Shopify still uses Hostinger env tokens and OAuth never created a store.
-- Safe to re-run.

WITH org AS (
  SELECT id, COALESCE(NULLIF(name, ''), 'DivyaPrabha Foods') AS name
  FROM workspaces
  ORDER BY created_at ASC
  LIMIT 1
),
ins AS (
  INSERT INTO stores (organization_id, name, shop_domain, status)
  SELECT
    org.id,
    org.name,
    'divyaprabhafoods.myshopify.com',
    'active'
  FROM org
  WHERE NOT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.shop_domain = 'divyaprabhafoods.myshopify.com'
       OR s.organization_id = org.id
  )
  RETURNING id, organization_id, shop_domain, status
)
UPDATE workspaces w
SET shopify_shop_domain = COALESCE(w.shopify_shop_domain, 'divyaprabhafoods.myshopify.com')
FROM org
WHERE w.id = org.id;

-- Activate any existing row for this shop / org
UPDATE stores
SET status = 'active',
    shop_domain = COALESCE(shop_domain, 'divyaprabhafoods.myshopify.com'),
    updated_at = NOW()
WHERE shop_domain = 'divyaprabhafoods.myshopify.com'
   OR organization_id = (SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1);

SELECT id, organization_id, name, shop_domain, status
FROM stores
ORDER BY created_at;
