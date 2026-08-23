# Project Changes Log - WhatsappAPI (wacrm)

This file is the **source of truth** for what changed in this fork (`arhamtechnology3-beep/WhatsappAPI`) for Arham Technology / DivyaPrabha Foods (`whatsapp.arhamtechnology.com`).

Keep it up to date for **current work and every future change**. `CHANGELOG.md` is the upstream wacrm product log; do not mix fork-specific production fixes into that file.

## How to log a change (required)

Whenever you modify files, fix a bug, add a feature, or ship to `main`, **add a new entry at the top** of the dated list below (newest first). Do this in the same PR as the code.

Entry template:

```
## [YYYY-MM-DD HH:MM] Type (Area) — Short title

### Root Cause
- What was wrong or missing (skip for pure features).

### Objective & Fixes
- What we changed and how to verify on live (hard-refresh, Sync Shopify, etc.).

### Files Modified
- `path/to/file`

### Live
- Git SHA / PR number if already on `main`.
- Migration required: `supabase/migrations/0xx_....sql` (or none).
```

Types: `Fix`, `Feat`, `Chore`, `Docs`. Areas: Contacts, Inbox, Shopify, Auth, Templates, Automations, Cache, etc.

---

## [2026-08-23 17:50] Fix (Automations) — delayed jobs run without a dashboard login

### Root Cause
- Cart drips, wait steps, and sequence sends only run when something GETs the cron routes. Those schedules lived in `vercel.json`, but live is Hostinger Node, so Vercel Cron never fired.
- Visiting the dashboard woke the Node process, which looked like “automations only work when I am logged in.” A laptop being off is unrelated; jobs must run on Hostinger.

### Objective & Fixes
- `src/instrumentation.ts` starts a 1-minute in-process ticker on `next start` (skipped on Vercel).
- `GET /api/cron/tick` runs all four workers. Hostinger hPanel should hit it every minute (header or `?secret=`).
- Time-based automations no longer skip when the wait-step queue is empty.
- After deploy: set `AUTOMATION_CRON_SECRET` on Hostinger, restart Node, add the hPanel cron. See `docs/hostinger-cron.md`.

### Files Modified
- `src/instrumentation.ts`
- `src/lib/cron/auth.ts`
- `src/lib/cron/auth.test.ts`
- `src/lib/cron/in-process.ts`
- `src/lib/cron/tick.ts`
- `src/app/api/cron/tick/route.ts`
- `src/app/api/shopify/cron/route.ts`
- `src/app/api/shopify/cron/sequences/route.ts`
- `src/app/api/automations/cron/route.ts`
- `src/app/api/flows/cron/route.ts`
- `vercel.json`
- `docs/hostinger-cron.md`
- `.env.local.example`
- `changes.md`

### Live
- PR on `cursor/always-on-automations-cron-8968`.
- Migration required: none.

## [2026-08-17 18:45] Fix (Automations) — cart step 3 sends once, not a burst

### Root Cause
- One customer cart can create several `shopify_recovery_tracking` rows (checkout id, token, and cart_token). When step 3 became due, each row sent `wacrm_cart_reminder_step3_v2` at the same time.
- Overlapping cron runs (every minute) sent the same tracking again before `current_step` advanced.
- Align-automations was overwriting the Shopify App delays (30 min / 24 h / 48 h) with recipe defaults.

### Objective & Fixes
- Claim a tracking row before Meta send so a second cron cannot send the same step.
- Keep one in-progress drip per contact + sequence; stop extras. Cart queue jobs are skipped when the sequence already owns the contact.
- Preserve existing step/rule delays and active toggles on align.
- After deploy: apply migration `049`. Step 3 should deliver one WhatsApp message. Order confirmed / shipped / delivered rules are unchanged.

### Files Modified
- `src/app/api/shopify/cron/sequences/route.ts`
- `src/app/api/shopify/cron/route.ts`
- `src/lib/shopify/shopify-helper.ts`
- `src/lib/shopify/sequence-dedupe.ts`
- `src/lib/shopify/sequence-dedupe.test.ts`
- `src/lib/shopify/automation-bindings.ts`
- `supabase/migrations/049_one_recovery_drip_per_contact.sql`
- `changes.md`

### Live
- On `main`: `dc899d1` (Hostinger). PR #36.
- Migration required: `supabase/migrations/049_one_recovery_drip_per_contact.sql` (run in production SQL editor).

## [2026-08-17 12:40] Feat (Flows) — Order Status Tracking looks up Shopify in chat

### Root Cause
- The Order Status Tracking flow collected `vars.order_no` then immediately handed off to an agent. Customers only saw “Checking details…” and waited for a human.

### Objective & Fixes
- After the order number, a Shopify lookup node fetches the order (local `shopify_orders`, then the contact’s Admin orders, then REST `name=` search) and sends payment, delivery, items, total, and tracking in WhatsApp.
- **Talk to agent** only after they see details (or if they tap **Other Query** on the greeting). **All good** ends the run.
- Engine also rewrites the old graph in memory so live chats work after deploy even before the canvas is saved. Open the flow and Save (or re-activate the bot template) to persist the new nodes.
- After deploy: WhatsApp “order status” → Check Status → `1006` → order details in chat, then All good / Talk to agent.

### Files Modified
- `src/lib/shopify/shopify-order-lookup.ts`
- `src/lib/shopify/shopify-order-lookup.test.ts`
- `src/lib/flows/order-tracking-patch.ts`
- `src/lib/flows/order-tracking-patch.test.ts`
- `src/lib/flows/engine.ts`
- `src/lib/flows/types.ts`
- `src/lib/flows/validate.ts`
- `src/lib/flows/zod-schema.ts`
- `src/lib/flows/edges.ts`
- `src/app/api/flows/[id]/route.ts`
- `src/app/api/flows/[id]/activate/route.ts`
- `src/app/api/bots/templates/[key]/activate/route.ts`
- `src/components/flows/shared.tsx`
- `src/components/flows/flow-canvas.tsx`
- `src/components/flows/flow-builder.tsx`
- `src/components/flows/flow-editor-state.tsx`
- `src/components/flows/forms/node-config-form.tsx`
- `supabase/migrations/048_order_tracking_shopify_lookup.sql`
- `changes.md`

### Live
- On `main`: `7be1304` (Hostinger `whatsapp.arhamtechnology.com`). PR #35.
- Migration required: `supabase/migrations/048_order_tracking_shopify_lookup.sql` (applied on production `bot_templates`; existing flow graphs are patched at runtime and on Save / re-activate).

## [2026-08-17 11:50] Fix (Inbox) — template Upload image always shows for Festival

### Root Cause
- Upload was hidden unless `message_templates.header_type` was `image`. Synced Festival rows often have a null `header_type` (Meta stores `header_handle`); the recipe still is IMAGE, so the picker only showed Body `{{1}}`.

### Objective & Fixes
- Resolve IMAGE headers from the Farm Didi recipe / `header_handle`, not only the DB column.
- Put a dashed **Click or drop a PNG / JPEG** zone at the top of the template fill modal (Festival and every `wacrm_*` template).
- After deploy: hard-refresh Inbox → Templates → `wacrm_festival_broadcast_v2` — drop zone appears above the preview.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/whatsapp-template-library.test.ts`
- `src/components/inbox/template-picker.tsx`
- `changes.md`

### Live
- On `main`: `6e31268` (Hostinger `whatsapp.arhamtechnology.com`).
- Migration required: none.

## [2026-08-17 09:45] Feat (Inbox) — upload an image and send it with the message

### Root Cause
- Inbox attach hid the typed message, so a photo and caption could not go out together.
- Template send skipped a custom header image (body-only first), and templates with no `{{vars}}` sent immediately with no chance to pick a photo.

### Objective & Fixes
- Inbox **+** attaches a photo above the composer; typed text is the caption; Send delivers image + caption together (inside the 24h window).
- Template picker: **Upload image** before Send. That public URL is sent as the template IMAGE header. If Meta rejects the link, send still falls back to the approved sample.
- After deploy: Inbox → tap **+** → Photo → type caption → Send. For templates: Templates → pick one → Upload image → Send template.

### Files Modified
- `src/components/inbox/message-composer.tsx`
- `src/components/inbox/template-picker.tsx`
- `src/lib/whatsapp/meta-api.ts`

### Live
- On `main`: `6e31268`.
- Migration required: none.

## [2026-08-16 18:20] Fix (Templates) — do not block Meta send on header image upload

### Root Cause
- Every inbox template send first fetched the Shopify PNG and uploaded it to WhatsApp `/media`. On Hostinger that call can hang or fail, so Graph never got the message. Festival (static CTAs) still failed after the retry deploy — same phone that received templates yesterday.
- If Meta paused the template after the failed burst, we never said so in the inbox.

### Objective & Fixes
- Send **body variables first** (no header `{ link }`, no URL-button suffix). WhatsApp still shows the approved image + buttons from the template.
- Look up the live Meta row (`APPROVED` vs `PAUSED`) and use Meta's language (`en` / `en_US`).
- Timeouts on Meta calls. Show the Graph error on the failed bubble.

### Files Modified
- `src/lib/whatsapp/meta-api.ts`
- `src/app/api/whatsapp/send/route.ts`
- `src/lib/automations/meta-send.ts`
- `src/components/inbox/message-bubble.tsx`
- `changes.md`

### Live
- Push to `main`. No new SQL.

---

## [2026-08-16 14:22] Fix (Templates) — restore template delivery (retry simpler Meta payload)

### Root Cause
- Yesterday’s templates delivered. After we started always sending IMAGE header `{ link }` plus URL-button `{{1}}` suffixes, Graph returned `#100 Invalid parameter` (or accepted then `#131053` media download). Festival (static CTAs) failed on the header; cart failed on header and/or the dynamic checkout suffix (`?key=`).

### Objective & Fixes
- Normalize language (`EN_US` → `en_US`) and IMAGE header casing.
- Upload the header PNG to WhatsApp `/media` and send `{ id }` so Meta does not have to crawl Shopify/Cloudflare.
- If Meta still rejects: retry without button components, then body-only (approved image + static CTAs still show on the customer’s phone).
- URL-button suffixes drop `?query` (Meta `#100`); fall back to the button `example` when a suffix is missing.

### Files Modified
- `src/lib/whatsapp/meta-api.ts`
- `src/lib/whatsapp/template-send-builder.ts`
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/whatsapp/meta-api.template-send.test.ts`
- `changes.md`

### Live
- Push to `main` after this commit.
- Migration: none (047 already applied).

---

## [2026-08-16 14:05] Feat (Templates) — WhatsApp-style image + CTA preview in Settings and picker

### Root Cause
- Settings template cards and the inbox template picker only printed body text. Header image and URL/quick-reply buttons were already on the row (or the Farm Didi recipe) but never rendered.
- Meta sync stores `header_handle` for IMAGE headers, not a public `header_media_url`, so a card with no fallback looks like a text-only template.

### Objective & Fixes
- Shared `WhatsAppTemplatePreview`: header PNG, interpolated body, footer, CTA rows (same layout the customer sees).
- Settings → Templates cards and the Inbox “Templates” picker use it. Inbox bubbles reuse the same chrome.
- Sync fills a missing IMAGE `header_media_url` with the live DivyaPrabha PNG so previews and sends have a fetchable link.
- Inbox delivery/URL-suffix fix from the previous commit on this branch is still required on live (merge this PR, run `047`, hard-refresh).

### Files Modified
- `src/components/whatsapp/whatsapp-template-preview.tsx`
- `src/components/settings/template-manager.tsx`
- `src/components/inbox/template-picker.tsx`
- `src/components/inbox/message-bubble.tsx`
- `src/app/api/whatsapp/templates/sync/route.ts`
- `changes.md`

### Live
- PR pending.
- Migration required: `supabase/migrations/047_message_template_payload.sql` (from earlier commit on this branch).

---

## [2026-08-16 13:41] Fix (Inbox) — template bubbles show image + CTAs; send URL suffix correctly

### Root Cause
- Inbox `template` bubbles only rendered body text. Header PNG and Shop Now / Complete Purchase buttons live on `message_templates`, and sends did not persist `media_url` or a button snapshot.
- Manual template send filled URL-button `{{1}}` with a full checkout URL or a coupon code. Meta requires the path after `https://divyaprabhafoods.com/` (e.g. `checkouts/cn/…`). Graph then returns `#100 Invalid parameter` and the bubble is `failed`.
- Failed Meta status `#131053` (cannot download header media) was treated as marketing opt-out.

### Objective & Fixes
- Render template messages like WhatsApp: header image, body, footer, CTA rows. Existing `wacrm_*` threads use the recipe even before a resend.
- Coerce button params to path-only suffixes; always send the live header PNG (or product image) on the IMAGE component.
- Persist `media_url` + `template_payload` on send; store Meta `error_message` on failed status.
- After Hostinger deploy, hard-refresh Inbox and resend a cart/festival template. Run migration `047` in Supabase so error text and CTA snapshots save.

### Files Modified
- `src/components/inbox/message-bubble.tsx`
- `src/components/inbox/message-thread.tsx`
- `src/components/inbox/template-picker.tsx`
- `src/app/api/whatsapp/send/route.ts`
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/automations/meta-send.ts`
- `src/app/api/whatsapp/webhook/route.ts`
- `supabase/migrations/047_message_template_payload.sql`
- `src/types/index.ts`
- `changes.md`

### Live
- Git SHA / PR pending.
- Migration required: `supabase/migrations/047_message_template_payload.sql`

---

## [2026-08-16 13:32] Fix (Inbox) — one conversation thread per contact

### Root Cause
- Contact merge re-pointed several conversation rows onto the same contact. Shopify automations then used `.maybeSingle()` / `.single()`, which fails when more than one thread exists, so each cart/COD send inserted another inbox row for the same phone (Jesal Panchal, Naman Domadia).

### Objective & Fixes
- Merge extra threads (move messages onto the newest one) and UNIQUE `(account_id, contact_id)`.
- Shared find-or-create for webhook, send, Shopify cron, and nudge.
- Inbox load and align-automations call `merge_duplicate_conversations`.

### Files Modified
- `supabase/migrations/046_one_conversation_per_contact.sql`
- `src/lib/inbox/find-or-create-conversation.ts`
- `src/app/api/whatsapp/webhook/route.ts`
- `src/app/api/whatsapp/send/route.ts`
- `src/app/api/shopify/cron/route.ts`
- `src/app/api/shopify/cron/sequences/route.ts`
- `src/app/api/shopify/checkout/nudge/route.ts`
- `src/components/inbox/conversation-list.tsx`
- `changes.md`

### Live
- Apply migration `046_one_conversation_per_contact.sql` in Supabase, then hard-refresh Inbox. No other migration.

---



### Root Cause
- Submit/name/header issues are resolved. Jesal confirmed Settings → Templates shows every Farm Didi recipe as **Approved** (en_US).

### Objective & Fixes
- Record live Meta status and the Shopify trigger each name is bound to. Hard-refresh Templates once after deploy so align copies APPROVED onto rules/steps.

| Template | Category | Trigger |
|---|---|---|
| `wacrm_cart_abandoned_v4` | Marketing | Cart drip step 1 (20 min) |
| `wacrm_cart_reminder_step2_v2` | Marketing | Cart drip step 2 (3 h) |
| `wacrm_cart_reminder_step3_v2` | Marketing | Cart drip step 3 (24 h) |
| `wacrm_browse_abandoned_v2` | Marketing | Browse drip (90 min) |
| `wacrm_cod_confirmation_v2` | Utility | COD `orders/create` |
| `wacrm_order_confirmed_v2` | Utility | Prepaid `orders/create` |
| `wacrm_order_shipped_v2` | Utility | Fulfilled / shipped |
| `wacrm_order_delivered_v2` | Utility | Delivered |
| `wacrm_festival_broadcast_v2` | Marketing | Broadcasts only (manual) |

- Offers in marketing copy: Buy 2 × 250g pickles FREE shipping, 10% OFF on ₹749+, FREE shipping above ₹599. Storefront `https://divyaprabhafoods.com/`. Collection `https://divyaprabhafoods.com/collections/all-products`. Track Order `https://divyaprabhafoods.com/account/orders` (static).
- Browse and cart steps 2–3 still need WhatsApp marketing opt-in. Cart drip stops on that checkout only.

### Files Modified
- `changes.md`
- `docs/whatsapp-template-setup.md`

### Live
- Templates approved in Meta on `whatsapp.arhamtechnology.com` (2026-08-16). Code on `main`: align automations `7565d7c` (#25). No migration.

---

## [2026-08-16 12:42] Fix (Automations) — align Shopify triggers to approved templates

### Root Cause
- Sequence steps have no `account_id`, so submit/sync/webhook never copied Meta APPROVED onto drip steps.
- Rules could still point at old names / `not_submitted`, so Shopify events skipped sending.
- Pending cart step 1 was treated as missing and the cron skipped ahead to step 2.

### Objective & Fixes
- Bindings: COD, order confirmed/shipped/delivered, cart 20m/3h/24h, browse 90m.
- Opening Templates or Shopify Store (or Install recipes) upserts those rules/steps, copies Meta status, and activates sequences.
- Order jobs only send when the rule is **approved**. Pending drip steps wait instead of skipping.
- Festival stays Broadcasts-only.

### Files Modified
- `src/lib/shopify/automation-bindings.ts`
- `src/lib/shopify/install-template-recipes.ts`
- `src/lib/shopify/shopify-helper.ts`
- `src/app/api/shopify/align-automations/route.ts`
- `src/app/api/shopify/cron/sequences/route.ts`
- `src/app/api/whatsapp/templates/submit/route.ts`
- `src/app/api/whatsapp/templates/sync/route.ts`
- `src/lib/whatsapp/template-webhook.ts`
- `src/components/settings/template-manager.tsx`
- `src/components/settings/shopify-settings.tsx`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `7565d7c` / [PR #25](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/25). No migration.

---

## [2026-08-16 12:32] Fix (Templates) — cart abandoned v4 (v2 already on Meta)

### Root Cause
- Other `*_v2` templates were new and went Pending. `wacrm_cart_abandoned_v2` (and historically v3) already existed on the WABA, so Meta #100 duplicate name.

### Objective & Fixes
- Cart abandoned recipe is `wacrm_cart_abandoned_v4`. Install recipes remaps v1/v2/v3 automations and drops the failed v2 draft.
- Do not resubmit templates that are already Pending.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/install-template-recipes.ts` (uses RECIPE_NAME_RENAMES)
- `src/lib/whatsapp/meta-api.ts`
- `src/app/api/shopify/checkout/nudge/route.ts`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `fc0d857` / [PR #24](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/24). No migration.

---

## [2026-08-16 12:25] Fix (Templates) — Meta name already exists; ship *_v2

### Root Cause
- Submitting `wacrm_*_v1` failed with Meta #100: English (US) already exists, or category UTILITY vs existing MARKETING.
- Our toast appended a Track Order URL hint onto every "Invalid parameter", which hid the real error.

### Objective & Fixes
- Recipes and automations use `*_v2` names. Install recipes inserts those drafts, remaps rules/steps from v1, deletes leftover v1 DRAFT/REJECTED rows.
- Toasts explain duplicate-name and category-lock errors. Bare Invalid parameter still mentions static Track Order.
- After deploy: Install recipes, then Submit only the v2 drafts (close the old v1 modal).

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/install-template-recipes.ts`
- `src/lib/whatsapp/meta-api.ts`
- `src/components/settings/template-manager.tsx`
- `src/components/settings/shopify-settings.tsx`
- `src/app/(dashboard)/shopify/page.tsx`
- `src/lib/automations/meta-send.ts`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `8983ca4` / [PR #23](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/23). No migration.

---

## [2026-08-16 12:15] Fix (Templates) — Utility Track Order Invalid parameter

### Root Cause
- Order confirmed/shipped used a dynamic URL button `https://divyaprabhafoods.com/{{1}}` plus suffix `account/orders`. Meta returns **Invalid parameter** for that pattern on Utility templates (body already has {{1}} for the name).

### Objective & Fixes
- Track Order is a static URL: `https://divyaprabhafoods.com/account/orders` (no suffix field).
- Toasts include Meta `error_user_msg` when present.
- You can submit the open modal now: change Track Order URL to that static link and clear the suffix.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/whatsapp-template-library.test.ts`
- `src/lib/whatsapp/meta-api.ts`
- `src/lib/whatsapp/meta-app-id.test.ts`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `2aec601` / [PR #22](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/22). No migration.

---

## [2026-08-16 12:00] Fix (Templates) — Unsupported post request on template submit

### Root Cause
- Image-header submit POSTs to `/{META_APP_ID}/uploads`. Hostinger `META_APP_ID` `1237128812817964` is not an object this WhatsApp token can use (wrong App / Page / WABA ID), so Meta returns Unsupported post request.

### Objective & Fixes
- Resolve App ID from the token (`debug_token`) before resumable upload; fall back to env.
- Rewrite that Meta error to say: set META_APP_ID to the Facebook App that issued the token, and check WABA ID in Settings → WhatsApp.
- After deploy: retry Submit. If it still fails, in Hostinger set `META_APP_ID` from developers.facebook.com → that WhatsApp app → Settings → Basic.

### Files Modified
- `src/lib/whatsapp/meta-api.ts`
- `src/lib/whatsapp/template-header-handle.ts`
- `src/app/api/whatsapp/templates/submit/route.ts`
- `changes.md`

### Live
- `main` `03cb063` / [PR #21](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/21). No migration.

---

## [2026-08-16 11:50] Fix (Templates) — Header image URL 404

### Root Cause
- Default header was `…/cdn/shop/files/share.jpg`, which Shopify CDN returns 404. Submit failed: "Header image URL returned 404. It must be publicly reachable."

### Objective & Fixes
- Use a live store PNG: `WhatsApp_Image_2025-04-12_at_4.37.20_PM.png` (HTTP 200, image/png).
- After deploy: Install recipes to refresh DRAFT headers, or paste that URL into the Header field and Submit.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/whatsapp-template-library.test.ts`
- `src/components/inbox/message-thread.tsx`
- `changes.md`

### Live
- `main` `c0bcb0d` / [PR #20](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/20). No migration.

---

## [2026-08-16 11:45] Fix (Templates) — Live offers and divyaprabhafoods.com URLs

### Root Cause
- Recipes still said 3% prepaid and free shipping above ₹499. Buttons could resolve to `*.myshopify.com` instead of the live store.

### Objective & Fixes
- Marketing bodies: Buy 2 x 250g pickles FREE shipping, 10% OFF on ₹749+, FREE shipping above ₹599.
- Customer URLs: `https://divyaprabhafoods.com/` and collection `https://divyaprabhafoods.com/collections/all-products` on Shop Now / Shop Bestsellers (cart, browse, festival).
- After deploy: **Install recipes** to refresh DRAFTS, then submit. Already-open festival modal: paste the new offer lines and set Shop Now to the collection URL.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/whatsapp-template-library.test.ts`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `600c6ca` / [PR #19](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/19). No migration.

---

## [2026-08-16 11:35] Fix (Templates) — Body cannot start with {{1}}

### Root Cause
- Meta (and wacrm's validator) reject template bodies that start with a variable. Festival and several other recipes opened with `{{1}}, …`, so Submit for Approval failed.

### Objective & Fixes
- Prefix those bodies with `Namaste {{1}}! …`.
- **Install recipes** now refreshes DRAFT/REJECTED copy so you do not have to recreate rows.
- After deploy: Install recipes again, then Submit for Approval.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/install-template-recipes.ts`
- `src/components/settings/template-manager.tsx`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `b68f038` / [PR #18](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/18). No migration.

---

## [2026-08-16 11:20] Feat (Templates & Automations) — Farm Didi-style Shopify recipes

### Root Cause
- Lifecycle templates were English body-only with checkout URLs in the body. Cart drip stop treated any later order on the contact as conversion, so a second cart could be cancelled.

### Objective & Fixes
- Rewrote `wacrm_*` recipes in Hinglish (image header, two CTA buttons, no raw URLs in body). Timings: browse 90m, cart 20m / 180m / 24h.
- **Install recipes** on Settings → Templates upserts DRAFT rows only.
- Send path fills product image (Shopify featured image, else `WHATSAPP_DEFAULT_HEADER_IMAGE_URL`) and URL-button suffixes.
- Cart drip stops only when **that** checkout is recovered (`cart_token`). Browse stops on later cart or order.
- Festival draft `wacrm_festival_broadcast_v1` for Broadcasts. No carousel / Shiprocket in this change.
- After deploy: Install recipes → submit to Meta → activate Shopify sequences. Do not Sync-from-Meta to reimport old bodies.

### Files Modified
- `src/lib/shopify/whatsapp-template-library.ts`
- `src/lib/shopify/install-template-recipes.ts`
- `src/app/api/whatsapp/templates/install-recipes/route.ts`
- `src/lib/automations/meta-send.ts`
- `src/app/api/shopify/cron/sequences/route.ts`
- `src/app/api/webhooks/shopify/orders-create/route.ts`
- `src/components/settings/template-manager.tsx`
- `docs/whatsapp-template-setup.md`
- `changes.md`

### Live
- `main` `eea857c` / [PR #17](https://github.com/arhamtechnology3-beep/WhatsappAPI/pull/17). No migration.

---

## [2026-08-16 11:05] Fix (Templates) — Sync from Meta must not re-import deleted templates

### Root Cause
- Settings → Templates **Sync from Meta** listed every Approved HSM on the WABA and **INSERTed** missing names. After Delete all, clicking Sync brought `wacrm_*` and `3p_direct_integration_test_template` back.

### Objective & Fixes
- Sync only **updates** rows that already exist in wacrm. It does not insert catalog-only templates.
- Skip Shopify recipe names (`wacrm_*`), Meta samples, and `3p_direct_integration_test_template`.
- After deploy: hard-refresh Templates, Delete all if needed, then Sync — the old list must stay empty.

### Files Modified
- `src/lib/whatsapp/template-sync-policy.ts`
- `src/lib/whatsapp/template-sync-policy.test.ts`
- `src/app/api/whatsapp/templates/sync/route.ts`
- `src/components/settings/template-manager.tsx`
- `changes.md`

### Live
- Ship on `main` after this PR. No migration.

---

## [2026-08-16 10:57] Fix (Templates) — Delete from wacrm even when Meta returns #100

### Root Cause
- Settings → Templates delete called Meta first. Error `(#100) Need permission on either WhatsApp Business Account or owner/shared business` returned HTTP 502 and **left the local row**, so the list never cleared.
- Bulk wipe also tried every Meta delete before local delete, so a timeout or a remembered failed `localStorage` key could skip cleanup. Sync from Meta can also re-import Approved templates.

### Objective & Fixes
- Single-template DELETE always removes the wacrm row; Meta is best-effort.
- **Delete all** on the Templates tab calls the wipe API (local-first).
- Retry dashboard wipe (`wacrm_cleared_templates_automations_20260816b`); only mark done after success.
- Do not click **Sync from Meta** if you want the list empty — that pulls Approved templates back from WABA.

### Files Modified
- `src/app/api/whatsapp/templates/[id]/route.ts`
- `src/lib/whatsapp/meta-api.ts`
- `src/lib/account/clear-templates-automations.ts`
- `src/app/(dashboard)/dashboard-shell.tsx`
- `src/components/settings/template-manager.tsx`
- `changes.md`

### Live
- Ship on `main` after this PR. Hard-refresh Settings → Templates and use **Delete all** if any rows remain.

---

## [2026-08-16 10:50] Chore (Templates & Automations) — Delete all existing templates and automations

### Root Cause
- Settings still listed seeded Shopify WhatsApp drafts (`wacrm_*`) and leftover automations.
- Opening Settings or Shopify **re-inserted** missing recipes via upsert, so a manual delete did not stick.

### Objective & Fixes
- On first dashboard load after deploy, wipe `message_templates`, `automations`, `shopify_automation_rules`, and `merchant_workflows` for the account (`POST /api/account/clear-templates-automations`). Tries Meta delete when a template was submitted.
- Stop auto-seeding Shopify recipe drafts in Template Manager and the Shopify page.
- One-shot via `localStorage` key `wacrm_cleared_templates_automations_20260816` so later templates you create are not deleted.

### Files Modified
- `src/lib/account/clear-templates-automations.ts`
- `src/app/api/account/clear-templates-automations/route.ts`
- `src/app/(dashboard)/dashboard-shell.tsx`
- `src/components/settings/template-manager.tsx`
- `src/app/(dashboard)/shopify/page.tsx`

### Live
- `8f26680` / PR #13 on `main`. After Hostinger deploy: hard-refresh dashboard once.

---

## [2026-08-16 10:38] Fix (Contacts) — One contact per email and mobile

### Root Cause
- Unique index only covered **non-empty phones**. Shopify checkouts often send email with a blank phone, so every sync inserted another row (e.g. 13 copies of `jesalp85@gmail.com`).
- Email lookup used `.maybeSingle()`, which errors once two copies exist, so the next sync inserted again.

### Objective & Fixes
- Match by case-insensitive email; prefer the row that already has a phone.
- Merge duplicates on Contacts load and after Sync Shopify.
- Block the same email on manual add and CSV import.
- Migration `045_contact_email_unique.sql` adds `email_normalized` + unique index (apply on Supabase when possible).

### Files Modified
- `src/lib/contacts/dedupe.ts`
- `src/lib/contacts/merge-duplicates.ts`
- `src/app/api/contacts/dedupe/route.ts`
- `src/app/api/shopify/sync-customers/route.ts`
- `src/lib/shopify/shopify-helper.ts`
- `src/app/(dashboard)/contacts/page.tsx`
- `src/components/contacts/contact-form.tsx`
- `src/components/contacts/import-modal.tsx`
- `supabase/migrations/045_contact_email_unique.sql`

### Live
- `15898a3` / PR #12 on `main`. Hard-refresh Contacts; duplicates merge automatically.

---

## [2026-08-15 12:58] Fix (Shopify) — Latest store contacts actually ingest

### Root Cause
- Formatted `+91 98203 68269` did not match CRM `9820368269` / `919820368269` (`LIKE` on spaced digits failed). Insert then hit unique `phone_normalized` and was swallowed.
- REST `order=updated_at+desc` could 400 and leave the customer list empty.

### Objective & Fixes
- `toMetaPhone` canonicalizes Indian 10-digit mobiles to `91…`.
- Lookup by `phone_normalized` and last-10 digits; recover unique-violation by updating the existing row.
- Newest customers via Admin GraphQL (`UPDATED_AT desc`) with REST fallbacks.
- Sync writes with the service-role client.
- Storefront capture looks up the Shopify customer and upserts the same way.
- Contacts **Updated** column; after sync, **Shopify Customers** filter.

### Files Modified
- `src/lib/whatsapp/phone-utils.ts`
- `src/lib/contacts/dedupe.ts`
- `src/lib/shopify/shopify-client.ts`
- `src/lib/shopify/shopify-helper.ts`
- `src/app/api/shopify/sync-customers/route.ts`
- `src/app/api/shopify/capture-visitor/route.ts`
- `src/app/(dashboard)/contacts/page.tsx`

### Live
- `2498c91` / PR #11 on `main`. Hard-refresh Contacts → Sync Shopify.

---

## [2026-08-15 10:26] Fix (Shopify) — Sync newest customers (pagination)

### Root Cause
- Sync fetched a single `/customers.json?limit=250` page with Shopify’s default order, so newer buyers never appeared.
- Re-sync did not move people up because the list sorted by `created_at`.

### Objective & Fixes
- Paginate Shopify REST (`Link: rel=next`), newest-first where supported.
- Sort Contacts by `updated_at`.
- Migration `044_filter_contacts_by_updated_at.sql` for the tag-filter RPC.

### Files Modified
- `src/lib/shopify/shopify-client.ts`
- `src/app/api/shopify/sync-customers/route.ts`
- `src/lib/shopify/shopify-helper.ts`
- `src/app/(dashboard)/contacts/page.tsx`
- `supabase/migrations/044_filter_contacts_by_updated_at.sql`

### Live
- `6509eeb` / PR #10 on `main`.

---

## [2026-08-15 10:00] Fix (Inbox) — Latest real threads on top

### Root Cause
- Postgres `ORDER BY last_message_at DESC` is **NULLS FIRST**, so Shopify-created empty conversations sat above real chats.

### Objective & Fixes
- Sort by `last_message_at` descending with nulls last.
- Hide threads with no `last_message_at` from the inbox list.

### Files Modified
- `src/lib/inbox/sort-conversations.ts`
- `src/components/inbox/conversation-list.tsx`
- `src/app/(dashboard)/inbox/page.tsx`

### Live
- `5886c8c` / `609b986` / PR #9 on `main`.

---

## [2026-08-09 01:27] Fix (Cache & Workspace) — Workspace Account-Scoped Page Caching & Empty Cache Rejection

### Root Cause
- `setCachedData` in `src/lib/cache/page-cache.ts` previously stored empty data payloads (e.g., `{ contacts: [], count: 0 }`). If an initial query executed before workspace context resolved, the empty result was saved into memory cache.
- `contacts/page.tsx` used a global cache key `'contacts_p0_s_t_qall'` missing the `accountId`. Switching workspaces or clearing cookies re-used this key, causing empty cached states to persist until storage/cookies were manually cleared.

### Objective & Fixes
- **Empty Result Rejection**: Updated `src/lib/cache/page-cache.ts` to reject storing empty data structures (e.g. `contacts: []` or 0 records) and set a 30-second TTL auto-expiration.
- **Account-Scoped Cache Keys**: Updated `src/app/(dashboard)/contacts/page.tsx` to scope cache keys by `accountId` (`contacts_${accountId}_...`) and only cache valid non-empty contact results.

### Files Modified
- `src/lib/cache/page-cache.ts`
- `src/app/(dashboard)/contacts/page.tsx`
- `changes.md`

---

## [2026-08-09 01:23] Fix (Contacts & Auth) — Instant Account ID Resolution & Contact Query Filtering

### Root Cause
- `useAuth()` calculated `accountId = activeWorkspace?.id || profile?.account_id || null`. On initial client load, before `/api/workspaces` HTTP fetch populated the `workspaces` array, `activeWorkspace` evaluated to `null`, causing `accountId` to become `null`.
- Without an explicit `account_id` query filter in `contacts/page.tsx`, the initial request without workspace context returned 0 rows (`No contacts yet.`).

### Objective & Fixes
- **Instant Workspace Account ID Resolution**: Updated `src/hooks/use-auth.tsx` to include `activeWorkspaceId` (read synchronously from cookie) in the `accountId` fallback: `const accountId = activeWorkspaceId || activeWorkspace?.id || profile?.account_id || null;`.
- **Explicit Account ID Query Filter**: Updated `src/app/(dashboard)/contacts/page.tsx` to explicitly filter contacts by `account_id = accountId`, ensuring all 152 contacts for Jesal Patel load immediately.

### Files Modified
- `src/hooks/use-auth.tsx`
- `src/app/(dashboard)/contacts/page.tsx`
- `changes.md`

---

## [2026-08-09 01:15] Fix (Dashboard) — Dashboard Skeleton Loader Unfreezing & Default Metrics Fallback

### Root Cause
- `DashboardPage` (`src/app/(dashboard)/dashboard/page.tsx`) checked `{metricsLoading || optInLoading || !metrics}` to render metric card skeletons. If `loadMetrics` returned `null` or encountered an initial query delay, `!metrics` evaluated to `true` indefinitely, locking the dashboard in skeleton loaders.

### Objective & Fixes
- **Fallback Metrics**: Initialized `metrics` state with a valid default `DEFAULT_METRICS` bundle to handle query fallbacks cleanly.
- **Safety Loading Fallbacks**: Added 3-second safety timers across all widget loading states (`setMetricsLoading`, `setOptInLoading`, `setSeriesLoading`, `setPipelineLoading`, `setResponseTimeLoading`, `setActivityLoading`) and removed `!metrics` from skeleton conditionals so widgets unfreeze immediately.

### Files Modified
- `src/app/(dashboard)/dashboard/page.tsx`
- `changes.md`

---

## [2026-08-09 01:12] Fix (Auth & UI) — Synchronous Workspace Cookie Initialization & Infinite Loading Prevention

### Root Cause
- `useAuth()` initialized `activeWorkspaceId` as `null` on client mount while awaiting asynchronous `/api/workspaces` HTTP fetch. During those milliseconds, page queries executed without workspace context cookie state, returning 0 rows or causing RLS mismatches.
- `fetchContacts()` and dashboard data fetchers lacked a `try ... finally` block, causing superseded sequence checks (`seq !== fetchSeq.current`) or RLS errors to leave `loading = true` on screen indefinitely without resetting state.

### Objective & Fixes
- **Synchronous Cookie Initialization**: Updated `src/hooks/use-auth.tsx` to initialize `activeWorkspaceId` synchronously from the `wacrm_active_workspace_id` cookie on mount.
- **Guaranteed `setLoading(false)`**: Wrapped `fetchContacts()` in `try ... finally` blocks and added a 3-second safety fallback timer to ensure loading spinners never get stuck.

### Files Modified
- `src/hooks/use-auth.tsx`
- `src/app/(dashboard)/contacts/page.tsx`
- `changes.md`

---

## [2026-08-09 01:00] Feat (Templates) — E-Commerce Lifecycle Templates & Store Product Image Enforcement

### Objective & Fixes
- Updated all 10 message template definitions in Supabase database (`message_templates` table) and `src/lib/automations/meta-send.ts` to replace stock Unsplash image URLs with authentic **DivyaPrabha Foods store product images** (`https://divyaprabhafoods.com/cdn/shop/files/Gor_Keri.jpg`).
- Verified complete Meta-compliant E-Commerce Lifecycle Messaging setup covering Pre-Purchase (Welcome, Browse Abandoned, 3-Step Cart Recovery) and Post-Purchase (Order Confirmed, COD Interactive Verification, Order Shipped, Out for Delivery, Order Delivered & Feedback).
- Ensured all templates include Call-to-Action (CTA) buttons, store product photos, and Opt-Out Footers (`Reply STOP to Unsubscribe`).

### Files Modified
- `src/lib/automations/meta-send.ts`
- `changes.md`

---

## [2026-08-09 00:50] Feat (Shopify) — Multi-Source Shopify Contact Sync (Customers + Orders + Checkouts)

### Objective & Fixes
- Enhanced Shopify contact sync (`src/app/api/shopify/sync-customers/route.ts`) to fetch contacts across **all three Shopify data sources**:
  1. `/customers.json?limit=250` (Registered store customers)
  2. `/orders.json?status=any&limit=250` (Guest checkout buyers & recent order placements)
  3. `/checkouts.json?limit=250` (Abandoned checkout leads)
- Added name, email, and phone fallback extraction so guest buyers and abandoned checkout leads automatically get imported into `contacts`.

### Files Modified
- `src/app/api/shopify/sync-customers/route.ts`
- `changes.md`

---

## [2026-08-09 00:30] Critical Fix — Meta WABA Webhook Subscription & Image Header Template Parameters

### Root Cause
1. Meta WABA lacked active app subscription (`POST /{waba_id}/subscribed_apps`), causing incoming webhooks (customer replies & status callbacks) to not be delivered to the app server.
2. Template messages with Image Headers (such as `wacrm_cart_abandoned_v3`) failed Meta Cloud API validation with error `#132012` (`Format mismatch, expected IMAGE, received UNKNOWN`) because `headerMediaUrl` was omitted from `template_message_params`.

### Fixes
- **WABA Subscribed Apps:** Subscribed the WABA (`893692403210890`) to this app via Graph API `/{waba_id}/subscribed_apps`.
- **Database Template Row:** Updated `message_templates` row for `wacrm_cart_abandoned_v3` with `header_type: 'image'` and `header_media_url: 'https://divyaprabhafoods.com/cdn/shop/files/Gor_Keri.jpg'`.
- **`src/components/inbox/message-thread.tsx` & `template-picker.tsx`**: Updated `handleSendTemplate` to automatically pass `headerMediaUrl` when template has an image header component.

### Files Modified
- `src/components/inbox/message-thread.tsx`
- `src/components/inbox/template-picker.tsx`
- `changes.md`

---

## [2026-07-28 17:32] Feat — Auto-fill Template Variables & Client Page Caching

### Objective & Fixes
- Added auto-filling of Meta WhatsApp message template variables based on store verification data.
- Added high-performance client-side page caching (`src/lib/cache/page-cache.ts`) to eliminate redundant API calls across navigation.
- Extended template picker component (`src/components/inbox/template-picker.tsx`) to auto-populate placeholder fields (`{{1}}`, `{{2}}`, etc.) with customer attributes and dynamic offer content.

### Files Modified & Added
- `src/lib/cache/page-cache.ts` [NEW]
- `src/components/inbox/template-picker.tsx`
- `src/app/(dashboard)/automations/page.tsx`
- `src/app/(dashboard)/broadcasts/page.tsx`
- `src/app/(dashboard)/contacts/page.tsx`
- `src/app/(dashboard)/ctwa-insights/page.tsx`
- `src/app/(dashboard)/inbox/page.tsx`
- `src/app/(dashboard)/pipelines/page.tsx`
- `src/components/contacts/contact-detail-view.tsx`
- `src/components/inbox/conversation-list.tsx`
- `src/hooks/use-auth.tsx`

---

## [2026-07-28 15:02] Feat (Shopify) — Dynamic Store Offer Calculation Matching Divyaprabha Foods

### Objective & Fixes
- Updated Shopify abandoned checkout nudge copy and dynamic offer calculation rules to align with cart rules on `divyaprabhafoods.com`.
- Enhanced Shopify checkout nudge API (`src/app/api/shopify/checkout/nudge/route.ts`) and sequence runner (`src/app/api/shopify/cron/sequences/route.ts`).

### Files Modified
- `src/app/api/shopify/checkout/nudge/route.ts`
- `src/app/api/shopify/cron/sequences/route.ts`

---

## [2026-07-28 13:47] Fix (Settings) — WhatsApp Meta App Review Status Display

### Objective & Fixes
- Fixed status indicator in settings (`src/components/settings/whatsapp-config.tsx`) to correctly display "Approved" status for accounts verified through Meta App Review.

### Files Modified
- `src/components/settings/whatsapp-config.tsx`

---

## [2026-07-28 13:25] Feat (Inbox) — Auto-populate Template Placeholders

### Objective & Fixes
- Updated inbox template picker and message thread to auto-fill customer names and cart item names into template parameters before sending.

### Files Modified
- `src/components/inbox/message-thread.tsx`
- `src/components/inbox/template-picker.tsx`

---

## [2026-07-28 13:18] Feat (Shopify) — V2 WhatsApp Template with Product Header & Inbox Preview

### Objective & Fixes
- Created V2 Shopify checkout nudge template featuring product header image, CTA buttons, custom store URL, and inbox preview text.
- Enhanced Meta API sending module (`src/lib/automations/meta-send.ts`).

### Files Modified
- `src/app/api/shopify/checkout/nudge/route.ts`
- `src/lib/automations/meta-send.ts`

---

## [2026-07-28 13:02] Fix (WhatsApp) — Template Language Fallback & Parameter Matching

### Objective & Fixes
- Resolved template language fallback logic and parameter array formatting for WhatsApp cart recovery messaging.
- Refactored `next.config.ts`, `src/lib/automations/meta-send.ts`, and `src/lib/whatsapp/meta-api.ts`.

### Files Modified
- `next.config.ts`
- `src/lib/automations/meta-send.ts`
- `src/lib/whatsapp/meta-api.ts`

---

## [2026-07-22 18:30] Fix (Webhook) — Verify Token Fallback for Meta Developer Portal

### Objective & Fixes
- Added verify token fallback in WhatsApp webhook verification endpoint (`src/app/api/whatsapp/webhook/route.ts`) to simplify setup in Meta Developer Portal.

### Files Modified
- `src/app/api/whatsapp/webhook/route.ts`

---

## [2026-07-22 18:21] Fix (Auth) — Account ID Fallback from Profiles Table

### Objective & Fixes
- Resolved infinite loading state across dashboard screens by restoring `accountId` fallback resolution from `profiles` table in `use-auth.tsx`.

### Files Modified
- `src/hooks/use-auth.tsx`

---

## [2026-07-22 18:00] Fix (Shopify) — Shopify Route, Sidebar Nav & Loading State

### Objective & Fixes
- Added `/shopify` dashboard route and sidebar navigation link.
- Resolved infinite loading issue in Shopify settings panel.

### Files Modified
- `src/app/(dashboard)/shopify/page.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/settings/shopify-settings.tsx`

---

## [2026-07-12] Feat — Multi-Workspace Architecture & Shopify OAuth Integration

### Objective & Fixes
- Built multi-workspace architecture with workspace switcher, RLS database policies, Shopify OAuth callbacks, and GDPR compliance webhooks.

### Files Modified
- `src/app/api/shopify/callback/route.ts`
- `src/app/api/shopify/install/route.ts`
- `src/app/api/webhooks/shopify/app-uninstalled/route.ts`
- `src/app/api/webhooks/shopify/gdpr/*`
- `src/app/api/workspaces/route.ts`
- `src/app/api/workspaces/switch/route.ts`
- `src/components/dashboard/workspace-switcher.tsx`
- `src/components/layout/sidebar.tsx`
- `src/hooks/use-auth.tsx`
- `supabase/migrations/040_multi_workspace.sql`
