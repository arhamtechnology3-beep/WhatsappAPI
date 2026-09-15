-- Logistics WhatsApp: Delhivery + AfterShip sit next to Shiprocket in
-- Integrations. Same OFD / delivered / NDR templates for every courier.

INSERT INTO integrations (key, name, description, category, is_active_by_default) VALUES
  (
    'delhivery',
    'Delhivery',
    'Push Out-for-Delivery, delivered, and NDR scans to WhatsApp with product image and tracking CTAs.',
    'logistics',
    false
  ),
  (
    'aftership',
    'AfterShip',
    'Track Bluedart, DTDC, Xpressbees, India Post and 1,000+ couriers. Status changes send WhatsApp automatically.',
    'logistics',
    false
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

UPDATE integrations
SET description = 'Shiprocket pickup, in-transit, OFD, delivered and NDR scans send WhatsApp with product image and Track Order.'
WHERE key = 'shiprocket';
