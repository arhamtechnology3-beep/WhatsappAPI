# IdentityFlow implementation plan

Working product name: **IdentityFlow** (override with `NEXT_PUBLIC_PRODUCT_NAME`). This is a fork of wacrm. We evolve in place: keep the WhatsApp CRM, add store-scoped identity, billing, and retention. Do not rewrite, do not delete inbox/CRM, and do not switch to NestJS / Prisma / Clerk / Redis for MVP.

Source of truth for product rules: the Shopify identity/retention spec. This file is the engineering sequence for *this* repository.

## Current vs target

```text
Spec:  User → Subscription → Organization(s) → one Shopify store + one WhatsApp each
Repo:  User → owner subscription → workspaces (= orgs) → one stores row per org
```

v1 mapping:

- Login subscription = `subscriptions.owner_user_id` (one current row); orgs link via `workspaces.subscription_id`
- Organization = `accounts` / `workspaces` (keep 1:1 ID sync); one Shopify shop + one WhatsApp number each
- WhatsApp inbox stays org-scoped
- Identity, events, campaigns remain store-scoped under that org
- Cap: `plans.max_organizations` (starter 1 / growth 3 / scale 10)

## Stack (locked)

- Next.js 16 App Router + React 19 + Tailwind + Zod + Vitest
- Supabase Postgres + Auth + RLS
- Postgres job rows + `/api/cron/tick` (no Redis/BullMQ in MVP)
- Cashfree = cart checkout recovery only, never store subscriptions
- Login billing = provider interface; default = Shopify App Billing, 7-day trial per login (shared across owned orgs)
- `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_API_TOKEN` remain the single-tenant runtime fallback until Phase 1 per-store tokens

## Phase 0 — Foundation (this slice)

Shipped in this change:

1. This file, `ARCHITECTURE.md`, `THREAT_MODEL.md`
2. Migration `052_identityflow_stores.sql` (stores, connections, plans, subscriptions, members, audit, consent stubs, visitor RLS lock-down, backfill)
3. Server `getCurrentStore` / `requireStoreRole` / `getStoreEntitlements`
4. Membership-checked org cookie; httpOnly store cookie; ignore client `workspace_id` / `store_id` query params
5. Isolation, IDOR, trial FSM, reinstall-without-reset tests
6. IdentityFlow nav behind `NEXT_PUBLIC_IDENTITYFLOW_NAV` or `beta_features` includes `identityflow`
7. `/api/health` and `/api/ready`

Do **not** in Phase 0: popup builder, passkeys, Shopify App Billing GraphQL, per-store Admin API cutover, or landing polish.

## Phase 1 — Shopify connection and billing

- Per-store encrypted Admin API tokens; stop using env credentials in multi-store runtime
- OAuth: timing-safe HMAC, `state`, idempotent reinstall, encrypt tokens
- Webhooks including GDPR; resolve shop by domain; async process + receipts
- Uninstall → `UNINSTALLED`, freeze entitlements, keep merchant config
- Shopify App Billing + billing UI that reads `getStoreEntitlements`
- Dashboard store switcher reloads store-scoped queries

## Phase 2 — Tracking and Customer 360

- Theme app embed SDK (in-repo replacement for missing `visitor-identifier.js`)
- Consent-first events; every row has `store_id`
- Incremental sync; Customer 360 linked to `contacts` only with consented identifiers
- Real GDPR export/redact

## Phase 3 — Campaigns

- Popup builder, triggers, segments, frequency caps, attribution
- Server-side offer eligibility; no PII in storefront HTML

## Phase 4 — Messaging

- Wire campaigns to existing Meta Cloud API, templates, opt-in, quiet hours, `whatsapp_send_jobs`
- Store-level sender only when a second store needs a different WABA

## Phase 5 — App Store readiness

- Usage limits, billing reconciliation, retention jobs, audited support access
- Playwright: two stores, trial vs paid, reinstall does not reset trial
- Security review; independent implementation (no GoKwik/KwikPass proprietary work)

## Phase 6 — Visitor recognition + WhatsApp recovery (replaces passkey idea)

In-house equivalent of KwikPass/BIK **without** a shared network, fingerprinting, OTP, or passkeys:

1. First-party tracker posts to `/api/v1/track` (Origin-resolved store); identity via `wcid` tagged WhatsApp links, order `dp_visitor_id`, signed logged-in customer, capture/checkout.
2. Recovery cron for identified visitors: cart / browse / visit nudges with consent, IST window, frequency caps.
3. OTP-free "Unlock offer on WhatsApp" popup (`ref CODE` → webhook claim + consent + auto-reply).
4. Dashboard `/visitors` (rate by source, funnel, settings).

Theme install notes: `docs/theme-visitor-recognition.md`. Migration: `059_visitor_recognition.sql`.

## Phase status (repo)

| Phase | Status |
|-------|--------|
| 0 Foundation | Done |
| 1 Shopify connection + billing | Done (App Billing + mock path) |
| 2 Tracking + Customer 360 | Done (SDK + ingest + GDPR handlers) |
| 3 Campaigns | Done (CRUD + popup helper) |
| 4 Messaging bridge | Done (campaign → whatsapp_send_jobs) |
| 5 Scale / ops | Done (usage, retention, support grants, cron) |
| 6 Visitor recognition + recovery | Done (code); apply 059 + theme snippets + approve `wacrm_visit_nudge_v1` |

Remaining App Store polish: theme app extension packaging (`shopify.app.toml`), Playwright e2e against two real shops, and Partner approval for protected customer data / passwordless login.

