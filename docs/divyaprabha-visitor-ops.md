# DivyaPrabha — visitor recognition ops (theme + settings)

Do these on the **DivyaPrabha** Shopify store and CRM. Backend is already live on `https://whatsapp.arhamtechnology.com`.

- Template `wacrm_visit_nudge_v1` — already submitted (wait for Meta **Approved**).
- Storefront CORS / track API — already working for `divyaprabhafoods.com`.

---

## 1. Theme scripts

**Where:** Shopify Admin → **Online Store → Themes → … → Edit code**

### 1a. Open `snippets/header-scripts.liquid`

Disable or remove any old load of `visitor-identifier.js` (legacy Supabase / fingerprinting).

### 1b. Paste this block

```liquid
{% comment %} IdentityFlow visitor recognition — CRM-hosted tracker + unlock popup {% endcomment %}
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
{% comment %} 21st.dev-style widget — replace any old wa-unlock-popup.js line (browsers cache the old URL) {% endcomment %}
<script src="https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-widget.js" defer></script>
```



### 1c. Theme setting (optional but recommended)

Add a theme setting named `visitor_hmac_secret` (or equivalent in `config/settings_schema.json`) and set it to the **same value** as CRM `ENCRYPTION_KEY` / `VISITOR_THEME_HMAC_SECRET` on Hostinger.

- Without it: anonymous tracking, `wcid` links, and order `dp_visitor_id` still work.
- With it: logged-in Shopify customers get a signed identify call.

### 1d. Save and publish

### 1e. Smoke check

1. Open `https://divyaprabhafoods.com` in a private window.
2. DevTools → Network → confirm `visitor-tracker.js` and `/api/v1/track` return **200**.
3. CRM → **Visitors** → a new session should appear within a minute.

### 1f. Cart attribute (one test order later)

The tracker writes `dp_visitor_id` via `/cart/update.js`. After Magic Checkout, confirm the order has that note attribute so orders link back to the visitor.

---

## 2. Visitors capture settings

**Where:** CRM → **Visitors** → **Settings**  
(`https://whatsapp.arhamtechnology.com/visitors`)

| Setting | Value |
|---|---|
| Popup enabled | **On** |
| Popup delay | `25` seconds (or match theme) |
| Offer text | e.g. `Unlock 10% OFF on WhatsApp` |
| Discount code | `DP10` (create this in Shopify Admin → Discounts first) |
| WhatsApp number | Business number, digits only with country code (e.g. `91XXXXXXXXXX`) |
| Browse / cart / visit nudges | **On** (defaults are fine) |

### Shopify discount (before enabling popup)

1. Shopify Admin → **Discounts → Create discount**.
2. Code: `DP10` (or change the CRM field to match whatever you create).
3. 10% off (or your offer), set dates / usage rules as you like.

### Alternative: Supabase SQL

If you prefer SQL over the UI, run in Supabase SQL Editor:

1. `scripts/seed-divyaprabha-store.sql` (only if `stores` row is missing — usually already created by live track).
2. `scripts/seed-visitor-capture-settings.sql`
3. Then set the phone:

```sql
UPDATE visitor_capture_settings v
SET whatsapp_number = '91XXXXXXXXXX',  -- your business WA digits
    updated_at = NOW()
FROM stores s
WHERE s.id = v.store_id
  AND (s.shop_domain ILIKE '%divyaprabha%' OR s.name ILIKE '%divyaprabha%');
```

---

## After both are done

| Check | Expected |
|---|---|
| Storefront loads tracker | Network 200 for both JS files |
| Browse a product ~1 min | Session in CRM → Visitors |
| Unlock popup (if enabled) | Appears after delay; WA opens with `ref CODE` |
| Meta template Approved | Visit nudges can send (browse/cart use existing approved recipes) |
| One paid test order | Order note / attribute includes `dp_visitor_id` |

More detail: `docs/theme-visitor-recognition.md`.
