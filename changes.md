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
- Ship on `main` after this PR. No migration.

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
- Ship on `main` after this PR. No migration.

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
