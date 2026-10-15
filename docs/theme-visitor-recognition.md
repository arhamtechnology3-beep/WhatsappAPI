# Theme install: visitor recognition

Add these snippets to the DivyaPrabha (and later The Pickle Affair) Shopify theme.

## 1. Script tags (`snippets/header-scripts.liquid`)

Replace or disable the old `visitor-identifier.js` asset that writes to the
legacy tracking Supabase project. Load the CRM-hosted tracker instead:

```liquid
<script>
  window.__IDENTITYFLOW_TRACK__ = {
    endpoint: "https://whatsapp.arhamtechnology.com",
    popupDelaySeconds: 25,
    {% if customer %}
    shopifyCustomerId: {{ customer.id | json }},
    shopifyCustomerSig: {{ customer.id | hmac_sha256: settings.visitor_hmac_secret | json }},
    {% endif %}
  };
</script>
<script src="https://whatsapp.arhamtechnology.com/identityflow/visitor-tracker.js" defer></script>
<script src="https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-popup.js" defer></script>
```

Add a theme setting `visitor_hmac_secret` (or hardcode the same value as
`VISITOR_THEME_HMAC_SECRET` / `ENCRYPTION_KEY` in the CRM env). Never commit
the secret into git.

## 2. Cart attributes

The tracker already POSTs `/cart/update.js` with `dp_visitor_id`. Confirm
Razorpay Magic Checkout preserves cart note attributes on the order
(`note_attributes` / cart attributes). Place one test order after install.

## 3. CORS

Ensure Hostinger env includes:

```
SHOPIFY_STOREFRONT_ORIGINS=https://divyaprabhafoods.com,https://www.divyaprabhafoods.com
```

## 4. Unlock popup

Enable in CRM → Visitors → Settings (`popup_enabled`), set WhatsApp number
and discount code (create the Shopify discount first).

Or run `scripts/seed-visitor-capture-settings.sql` in the Supabase SQL Editor
(then set `whatsapp_number` in that script’s UPDATE, or in the CRM UI).

## 5. Quick copy-paste for `snippets/header-scripts.liquid`

```liquid
{% comment %} IdentityFlow visitor recognition — replace legacy visitor-identifier.js {% endcomment %}
<script>
  window.__IDENTITYFLOW_TRACK__ = {
    endpoint: "https://whatsapp.arhamtechnology.com",
    popupDelaySeconds: 25,
    {% if customer %}
    shopifyCustomerId: {{ customer.id | json }},
    shopifyCustomerSig: {{ customer.id | hmac_sha256: settings.visitor_hmac_secret | json }},
    {% endif %}
  };
</script>
<script src="https://whatsapp.arhamtechnology.com/identityflow/visitor-tracker.js" defer></script>
<script src="https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-popup.js" defer></script>
```

Until Hostinger finishes deploying `main` (`e2d79b0`+), those script URLs 404.
After deploy they should return `200` with JavaScript.
