# WhatsApp Template Setup Guide

Pre-configured **DivyaPrabha Foods** recipes (Farm Didi-style Hinglish, image header, two CTA buttons). All nine names below are **Meta Approved** (en_US) as of 2026-08-16.

---

## How to submit

1. In wacrm go to **Settings → Templates** and click **Install recipes** only if a draft is missing. Cart abandoned is `wacrm_cart_abandoned_v4` (v1–v3 already existed on Meta).
2. Do not resubmit an Approved name. Meta will not recreate the same name + English (US).
3. Template **names must match exactly**. Language: `en_US`.
4. Storefront buttons: `https://divyaprabhafoods.com/` and collection `https://divyaprabhafoods.com/collections/all-products` (never `*.myshopify.com`). Marketing offers: Buy 2 x 250g pickles FREE shipping, 10% OFF on ₹749+, FREE shipping above ₹599 — no 3% prepaid.
5. Do **not** put raw URLs in the body. Marketing checkout/product buttons use `https://divyaprabhafoods.com/{{1}}`. Utility **Track Order** must be a static URL `https://divyaprabhafoods.com/account/orders` (no `{{1}}`, empty suffix) — Meta returns **Invalid parameter** otherwise.
6. Opening **Settings → Templates** or **Shopify Store** aligns automations to these names and copies Meta **Approved** onto rules/steps. Festival `wacrm_festival_broadcast_v2` is for Broadcasts, not a Shopify trigger.
7. **Sync from Meta** only refreshes templates already in wacrm. It will not re-import deleted `wacrm_*` names.

---

## Live automations

| Name | Category | Meta | Delay | Trigger |
|---|---|---|---|---|
| `wacrm_browse_abandoned_v2` | MARKETING | Approved | 90 min | Browse drip |
| `wacrm_cart_abandoned_v4` | MARKETING | Approved | 20 min | Cart drip step 1 |
| `wacrm_cart_reminder_step2_v2` | MARKETING | Approved | 180 min | Cart drip step 2 |
| `wacrm_cart_reminder_step3_v2` | MARKETING | Approved | 24 h | Cart drip step 3 |
| `wacrm_cod_confirmation_v2` | UTILITY | Approved | immediate | COD order |
| `wacrm_order_confirmed_v2` | UTILITY | Approved | immediate | Prepaid order |
| `wacrm_order_shipped_v2` | UTILITY | Approved | immediate | Shipped |
| `wacrm_order_delivered_v2` | UTILITY | Approved | immediate | Delivered |
| `wacrm_festival_broadcast_v2` | MARKETING | Approved | manual | Broadcasts |

### Cart #1 body (example)

```text
Namaste {{1}}! Aapka cart wait kar raha hai 🛒
{{2}} — abhi bhi available hai!

✅ Handmade, no chemical preservatives
✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on ₹749+ | Free ship above ₹599

Complete purchase se order confirm karo.
```

Full copy lives in `src/lib/shopify/whatsapp-template-library.ts`.

---

## Stop rules

- Cart drip stops when **that checkout** is recovered (`cart_token` match on `orders/create`). A later order from the same customer does **not** cancel a different open cart.
- Browse drip stops if the contact adds to cart or places an order after the browse session.

---

## Not in this version

Carousel / catalog cards, Shiprocket OFD–Delivered–NDR, back-in-stock, price-drop, replenishment, and VIP winback are not wired yet.
