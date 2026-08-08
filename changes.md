# Project Changes Log - WhatsappAPI (wacrm)

This file tracks all modifications, updates, bug fixes, and feature additions made to the **WhatsappAPI (wacrm)** codebase.

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
