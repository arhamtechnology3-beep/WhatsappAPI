# WhatsApp Template Setup Guide

Pre-configured **DivyaPrabha Foods** recipes (Farm Didi-style Hinglish, image header, two CTA buttons). Install drafts in wacrm, then submit them to Meta.

---

## How to submit

1. In wacrm go to **Settings → Templates** and click **Install recipes**. That creates local **DRAFT** rows only (it does not re-seed on every page load).
2. Open each draft → **Submit for Approval**, **or** paste the same name/body/buttons into [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/).
3. Template **names must match exactly** (e.g. `wacrm_cart_abandoned_v1`). Language: `en_US`.
4. Header: **IMAGE**. wacrm fills the product photo at send time from Shopify; a brand banner is the fallback (`WHATSAPP_DEFAULT_HEADER_IMAGE_URL`).
5. Do **not** put raw URLs in the body — checkout / product / tracking live on buttons (`https://your-store/{{1}}`).
6. After Meta approves, on **Settings → Shopify Store** mark the matching rule/sequence **Approved & Active**.
7. **Sync from Meta** only refreshes templates already in wacrm. It will not re-import deleted `wacrm_*` names.

---

## Live automations

| Name | Category | Delay | Body vars | Buttons |
|---|---|---|---|---|
| `wacrm_browse_abandoned_v1` | MARKETING | 90 min | `{{1}}` name, `{{2}}` product | Order Now (product URL), Shop From WhatsApp |
| `wacrm_cart_abandoned_v1` | MARKETING | 20 min | `{{1}}` name, `{{2}}` items | Complete Purchase (checkout), Shop From WhatsApp |
| `wacrm_cart_reminder_step2_v1` | MARKETING | 180 min | `{{1}}` name, `{{2}}` items | Complete Purchase, Shop Bestsellers |
| `wacrm_cart_reminder_step3_v1` | MARKETING | 24 h | `{{1}}` name, `{{2}}` items, `{{3}}` discount code | Complete Purchase, Shop From WhatsApp |
| `wacrm_cod_confirmation_v1` | UTILITY | immediate | name, order #, total | Quick replies: Yes, confirm order / Cancel order |
| `wacrm_order_confirmed_v1` | UTILITY | immediate | name, order #, total | Track Order, Shop From WhatsApp |
| `wacrm_order_shipped_v1` | UTILITY | immediate | name, order # | Track Order, Shop From WhatsApp |
| `wacrm_order_delivered_v1` | UTILITY | immediate (Shopify fulfilled) | name, order # | Rate Your Order, Shop From WhatsApp |
| `wacrm_festival_broadcast_v1` | MARKETING | manual Broadcasts | `{{1}}` name | Shop Now, Shop From WhatsApp |

### Cart #1 body (example)

```text
Namaste {{1}}! Aapka cart wait kar raha hai 🛒
{{2}} — abhi bhi available hai!

✅ Handmade, no chemical preservatives
✅ COD available | Free shipping above ₹499
✅ 3% OFF on prepaid

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
