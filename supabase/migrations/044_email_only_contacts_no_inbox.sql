-- Email-only Shopify customers stay on Contacts.
-- They must not occupy Inbox (WhatsApp requires a mobile number).
-- Contacts with neither phone nor email are removed.

-- Treat phones that contain no digits as empty.
UPDATE contacts
SET phone = ''
WHERE COALESCE(phone_normalized, '') = ''
  AND phone IS DISTINCT FROM '';

-- Drop inbox threads for contacts that cannot receive WhatsApp.
DELETE FROM conversations
WHERE contact_id IN (
  SELECT id FROM contacts
  WHERE COALESCE(phone_normalized, '') = ''
);

-- Remove contacts that have no way to identify the person.
-- Email-only rows are kept (they still show on the Contacts page).
DELETE FROM contacts
WHERE COALESCE(phone_normalized, '') = ''
  AND (email IS NULL OR btrim(email) = '');
