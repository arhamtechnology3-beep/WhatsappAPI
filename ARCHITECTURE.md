# IdentityFlow architecture

Modular monolith on Next.js. Organization = existing workspace/account. Store is a new first-class child. WhatsApp CRM stays org-scoped.

## Runtime

```text
Merchant browser
  → Supabase Auth cookies
  → getCurrentAccount()  (org: workspace cookie, membership verified)
  → getCurrentStore()    (store: httpOnly cookie, store_members + org role)
  → getStoreEntitlements(storeId, actor)
  → /api/v1 and dashboard loaders

Shopify storefront (later phases)
  → theme app embed / pixel
  → signed ingest routes (not anon RLS writes)

Shopify
  → HMAC webhooks
  → receipt row
  → async cron/queue
```

## Tenancy

| Spec | Table / column |
|------|----------------|
| Platform user | `auth.users` + `profiles` |
| Organization | `workspaces.id` (= `accounts.id`) |
| Store | `stores.organization_id` |
| Shopify token | `shopify_connections.encrypted_access_token` |
| Subscription | `subscriptions` (one current row per store) |
| Trial history | `shop_trial_history` keyed by shop domain / shop id |

Active org cookie: `wacrm_active_workspace_id`. Set only by `POST /api/workspaces/switch` after membership check. Middleware must not copy `?workspace_id=` into it.

Active store cookie: `wacrm_active_store_id` (httpOnly). Set only by `POST /api/v1/stores/switch` after org membership **and** store access. Never trust `store_id` or `organization_id` from the browser as authorization.

## Authorization

Org roles stay `owner | admin | agent | viewer`.

Store access:

- Org owner/admin: all stores in the organization
- Org agent/viewer: only stores in `store_members`
- Effective store role is the store assignment, or the org role for owner/admin

RLS helper: `is_store_member(store_id, min_role)`. Application code still calls `getCurrentStore` / `requireStoreRole` and filters by `store_id`.

## Billing

Finite state machine (see `src/lib/billing/subscription-state.ts`):

```text
PENDING_INSTALL → TRIALING → ACTIVE
                              PAST_DUE → SUSPENDED
                              CANCELLED / EXPIRED
                 UNINSTALLED (from any state)
```

- Trial: 7 calendar days UTC, starts only after successful install
- Reinstall does not grant a new trial (`shop_trial_history`)
- Plans are rows in `plans`, not frontend constants
- `getStoreEntitlements` is the only feature gate for IdentityFlow paid modules
- Existing WhatsApp inbox / recovery does **not** require entitlements in Phase 0
- Env-token Shopify client (`src/lib/shopify/shopify-client.ts`) remains the live fallback

Billing provider interface (Phase 1): Shopify App Billing default. Cashfree stays cart recovery.

## Feature flags

Incomplete IdentityFlow chrome (Customer 360, Campaigns, Billing, Privacy, store switcher) is hidden unless:

- `NEXT_PUBLIC_IDENTITYFLOW_NAV=true`, or
- `profiles.beta_features` contains `identityflow`

## Observability

- `GET /api/health` — process up
- `GET /api/ready` — required env present
- `x-request-id` on responses (generated in middleware if missing)

## What we are not introducing in MVP

Separate NestJS service, Prisma, Clerk, Redis/BullMQ, a second `organizations` table, or dual SaaS billing (Cashfree + Shopify) for the same store.
