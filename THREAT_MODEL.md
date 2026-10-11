# IdentityFlow threat model (Phase 0)

Scope: tenant isolation, billing entitlements, Shopify secrets, visitor ingest, and support access. This is not a full App Store review.

## Assets

- Shopify Admin API tokens
- Merchant sessions and org/store membership
- Storefront visitor events and identity links (phone/email)
- Subscription / trial state (paid feature access)
- WhatsApp tokens (existing encryption)

## Trust boundaries

1. Browser (merchant dashboard) — untrusted for `organization_id`, `store_id`, plan names, and entitlement flags
2. Shopify storefront JS — untrusted; must not write visitor rows via open anon RLS
3. Shopify webhooks — untrusted until HMAC verified
4. Supabase anon key — must not authorize cross-store reads/writes
5. Service role — server only; every query still filtered by resolved org/store

## Threats and Phase 0 controls

### Cross-tenant IDOR

**Threat:** Attacker sets `?workspace_id=` / `?store_id=` or sends another tenant’s UUID in JSON.

**Control:** Middleware ignores those query params for cookies. Switch endpoints verify membership. `getCurrentAccount` / `getCurrentStore` resolve from session + verified cookie, never from trusted client IDs. Tests cover foreign store IDs.

### Entitlement bypass

**Threat:** UI shows Growth features while subscription is expired.

**Control:** `getStoreEntitlements` is server-side. Paid IdentityFlow features default off unless status is `TRIALING` (within `trial_end`) or `ACTIVE`. Plan name from the client is ignored.

### Trial abuse via reinstall

**Threat:** Uninstall/reinstall resets a 7-day trial.

**Control:** `shop_trial_history` keyed by shop domain / Shopify shop id. `resolveInstallSubscription` reuses historical trial dates and will not start a second trial.

### Token theft

**Threat:** Plaintext OAuth tokens in `merchant_integrations`.

**Control:** New tokens go to `shopify_connections.encrypted_access_token` (AES-256-GCM via existing `ENCRYPTION_KEY`). Phase 0 does not yet migrate runtime off env tokens; Phase 1 must.

### Visitor table dump / injection

**Threat:** Anon RLS on `visitor_sessions` allowed world insert/update/select.

**Control:** Migration 052 drops anon policies. Ingest must use server routes. Rows gain optional `store_id`.

### Webhook forgery / GDPR no-op

**Threat:** Fake `app/uninstalled` or ignored `customers/redact`.

**Control:** Existing HMAC helper stays mandatory. GDPR handlers remain stubs until Phase 1/2 — called out as residual risk. Do not process business data before HMAC.

### Secret logging

**Threat:** OTPs, access tokens, or raw PII in logs.

**Control:** Log `organization_id`, `store_id`, and `x-request-id` only. Never log tokens. Audit logs store action metadata, not secrets.

### Support impersonation

**Threat:** Staff read raw tokens.

**Control:** Not implemented. When added: time-limited, audited, no secret columns.

## Residual risk (accepted until later phases)

- Runtime Shopify Admin calls still use host env token (single-store ops)
- GDPR routes return 200 without export/redact
- No passkeys / session inventory
- Open logistics webhooks that take `account_id` from query (pre-existing; out of this slice)

## Stop conditions (spec rule 18)

- Do not ship storefront passwordless login until Shopify protected-customer-data approval and real compliance webhooks exist
- Do not dual-charge a store with Cashfree SaaS billing and Shopify App Billing
- Do not copy GoKwik/KwikPass proprietary APIs or UI
