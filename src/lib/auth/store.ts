import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ForbiddenError,
  getCurrentAccount,
  type AccountContext,
} from "./account";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";
import {
  canAccessStore,
  resolveAccessibleStore,
  type StoreRecord,
  type StoreRole,
} from "./store-access";
import { STORE_COOKIE } from "./store-cookie";
import {
  computeStoreEntitlements,
  type StoreEntitlements,
} from "@/lib/billing/entitlements";
import { getSubscriptionForOrganization } from "@/lib/billing/owner-subscription";
import type { SubscriptionStatus } from "@/lib/billing/subscription-state";
import { SUBSCRIPTION_STATUSES } from "@/lib/billing/subscription-state";

export interface StoreContext extends AccountContext {
  store: StoreRecord;
  storeRole: StoreRole;
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

function mapStoreRow(row: {
  id: string;
  organization_id: string;
  name: string;
  shop_domain: string | null;
  shopify_shop_id: string | null;
  status: string;
}): StoreRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    shopDomain: row.shop_domain,
    shopifyShopId: row.shopify_shop_id,
    status: row.status,
  };
}

async function readStoreCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(STORE_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

async function loadOrgStores(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<StoreRecord[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, organization_id, name, shop_domain, shopify_shop_id, status")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[getCurrentStore] stores fetch error:", error);
    throw new ForbiddenError("Could not load store context");
  }

  return (data ?? []).map(mapStoreRow);
}

async function loadStoreMemberships(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<Array<{ storeId: string; role: StoreRole }>> {
  const { data, error } = await supabase
    .from("store_members")
    .select("store_id, role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[getCurrentStore] store_members fetch error:", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => isAccountRole(row.role))
    .map((row) => ({ storeId: row.store_id as string, role: row.role as StoreRole }));
}

/**
 * Resolve the active store from the httpOnly cookie, falling back to
 * the first store the caller can access. Client-supplied store IDs are
 * not read here.
 */
export async function getCurrentStore(): Promise<StoreContext> {
  const account = await getCurrentAccount();
  const requestedStoreId = await readStoreCookie();
  const stores = await loadOrgStores(account.supabase, account.accountId);
  const memberships = await loadStoreMemberships(
    account.supabase,
    account.userId,
    account.accountId,
  );

  const resolved = resolveAccessibleStore({
    actorOrganizationId: account.accountId,
    orgRole: account.role,
    requestedStoreId,
    stores,
    memberships,
  });

  if (!resolved) {
    throw new ForbiddenError("No accessible store in this organization");
  }

  return {
    ...account,
    store: resolved.store,
    storeRole: resolved.role,
  };
}

export async function requireStoreRole(min: AccountRole): Promise<StoreContext> {
  const ctx = await getCurrentStore();
  if (!hasMinRole(ctx.storeRole, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' store role or higher`,
    );
  }
  return ctx;
}

/**
 * Load a store by id only if it belongs to the actor's organization
 * and the actor may access it. Used by switch endpoints — the body
 * storeId is an *attempt*, not authorization.
 */
export async function loadAccessibleStoreForActor(
  account: AccountContext,
  storeId: string,
): Promise<{ store: StoreRecord; storeRole: StoreRole } | null> {
  const { data, error } = await account.supabase
    .from("stores")
    .select("id, organization_id, name, shop_domain, shopify_shop_id, status")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) return null;

  const store = mapStoreRow(data);
  const memberships = await loadStoreMemberships(
    account.supabase,
    account.userId,
    account.accountId,
  );
  const memberRole = memberships.find((m) => m.storeId === store.id)?.role ?? null;

  if (
    !canAccessStore({
      actorOrganizationId: account.accountId,
      orgRole: account.role,
      store,
      storeMemberRole: memberRole,
    })
  ) {
    return null;
  }

  const resolved = resolveAccessibleStore({
    actorOrganizationId: account.accountId,
    orgRole: account.role,
    requestedStoreId: store.id,
    stores: [store],
    memberships,
  });
  return resolved ? { store: resolved.store, storeRole: resolved.role } : null;
}

export async function getStoreEntitlements(
  storeId: string,
  actor: AccountContext,
): Promise<StoreEntitlements> {
  const accessible = await loadAccessibleStoreForActor(actor, storeId);
  if (!accessible) {
    throw new ForbiddenError("Store is not in this organization");
  }

  // Entitlements come from the login subscription shared across the
  // owner's organizations — not a per-store billing row.
  const ownerSub = await getSubscriptionForOrganization(
    actor.supabase,
    accessible.store.organizationId,
  );

  const planId = ownerSub?.planId ?? null;
  let planRow: {
    plan_id: string;
    feature_entitlements: unknown;
    usage_limits: unknown;
    max_organizations?: number | null;
  } | null = null;

  if (planId) {
    const { data } = await actor.supabase
      .from("plans")
      .select("plan_id, feature_entitlements, usage_limits, max_organizations")
      .eq("plan_id", planId)
      .maybeSingle();
    planRow = data;
  }

  const memberships = await loadStoreMemberships(
    actor.supabase,
    actor.userId,
    actor.accountId,
  );

  const usageLimits = {
    ...((planRow?.usage_limits as Record<string, unknown>) ?? {}),
    maxOrganizations:
      typeof planRow?.max_organizations === "number"
        ? planRow.max_organizations
        : ownerSub?.maxOrganizations ?? 0,
  };

  return computeStoreEntitlements({
    store: accessible.store,
    actor: {
      userId: actor.userId,
      organizationId: actor.accountId,
      orgRole: actor.role,
      storeMemberRole:
        memberships.find((m) => m.storeId === storeId)?.role ?? null,
    },
    subscription: ownerSub
      ? {
          status: isSubscriptionStatus(ownerSub.status)
            ? ownerSub.status
            : "PENDING_INSTALL",
          planId: planId ?? "none",
          trialEnd: ownerSub.trialEnd,
        }
      : null,
    plan: planRow
      ? {
          planId: planRow.plan_id,
          featureEntitlements: planRow.feature_entitlements,
          usageLimits,
        }
      : null,
  });
}

export async function listAccessibleStores(
  account: AccountContext,
): Promise<StoreRecord[]> {
  const stores = await loadOrgStores(account.supabase, account.accountId);
  const memberships = await loadStoreMemberships(
    account.supabase,
    account.userId,
    account.accountId,
  );
  return stores.filter((store) =>
    canAccessStore({
      actorOrganizationId: account.accountId,
      orgRole: account.role,
      store,
      storeMemberRole: memberships.find((m) => m.storeId === store.id)?.role ?? null,
    }),
  );
}
