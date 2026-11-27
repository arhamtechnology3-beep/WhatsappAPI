# Theme install: visitor recognition

## Free-plan default (Option A) — **recommended now**

Storefront **page/session tracking is OFF** in the CRM unless
`ENABLE_VISITOR_TRACKING=1` is set on Hostinger.

**Abandoned cart recovery still works** via Shopify checkout webhooks →
`shopify_checkouts` → `/api/cron/tick` (every 2 hours). It does **not** need
`visitor-tracker.js` or `tracking_events`.

For max Free-plan savings, **remove** (or comment out) the IdentityFlow tracker
from the theme. Keep only cart/checkout Shopify webhooks + CRM cron.

Optional: leave the unlock widget if you still use DP10 WhatsApp unlock:

```liquid
{% comment %} Tracking disabled — cart recovery uses Shopify webhooks only {% endcomment %}
<script src="https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-widget.js" defer></script>
```

Or keep the tracker script but disable network:

```liquid
<script>
  window.__IDENTITYFLOW_TRACK__ = {
    endpoint: "https://whatsapp.arhamtechnology.com",
    disabled: true
  };
</script>
<script src="https://whatsapp.arhamtechnology.com/identityflow/visitor-tracker.js" defer></script>
```

## Full IdentityFlow tracking (VPS / paid quota only)

Set on Hostinger Node env, then restart:

```
ENABLE_VISITOR_TRACKING=1
```

Add these snippets to the DivyaPrabha (and later The Pickle Affair) Shopify theme.

### 1. Script tags (`snippets/header-scripts.liquid`)

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
<script src="https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-widget.js" defer></script>
```

Add a theme setting `visitor_hmac_secret` (or hardcode the same value as
`VISITOR_THEME_HMAC_SECRET` / `ENCRYPTION_KEY` in the CRM env). Never commit
the secret into git.

### 2. Cart attributes

The tracker already POSTs `/cart/update.js` with `dp_visitor_id`. Confirm
Razorpay Magic Checkout preserves cart note attributes on the order
(`note_attributes` / cart attributes). Place one test order after install.

### 3. CORS

Ensure Hostinger env includes:

```
SHOPIFY_STOREFRONT_ORIGINS=https://divyaprabhafoods.com,https://www.divyaprabhafoods.com
```

### 4. Unlock popup

Enable in CRM → Visitors → Settings (`popup_enabled`), set WhatsApp number
and discount code (create the Shopify discount first).

Or run `scripts/seed-visitor-capture-settings.sql` in the Supabase SQL Editor
(then set `whatsapp_number` in that script’s UPDATE, or in the CRM UI).

Use `wa-unlock-widget.js` (not `wa-unlock-popup.js`) so browsers don’t keep an old cached design.
