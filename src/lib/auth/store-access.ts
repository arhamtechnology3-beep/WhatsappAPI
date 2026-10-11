import type { AccountRole } from "./roles";
import { hasMinRole } from "./roles";

export type StoreRole = AccountRole;

export interface StoreRecord {
  id: string;
  organizationId: string;
  name: string;
  shopDomain: string | null;
  shopifyShopId: string | null;
  status: string;
}

/**
 * Org owner/admin may act on every store in the organization.
 * Agent/viewer need an explicit store_members row.
 */
export function canAccessStore(opts: {
  actorOrganizationId: string;
  orgRole: AccountRole;
  store: Pick<StoreRecord, "organizationId">;
  storeMemberRole: StoreRole | null;
}): boolean {
  if (opts.store.organizationId !== opts.actorOrganizationId) {
    return false;
  }
  if (hasMinRole(opts.orgRole, "admin")) {
    return true;
  }
  return opts.storeMemberRole !== null;
}

/**
 * Effective role on the store. Owner/admin keep their org role.
 * Assigned members use the store_members role.
 */
export function effectiveStoreRole(opts: {
  orgRole: AccountRole;
  storeMemberRole: StoreRole | null;
}): StoreRole | null {
  if (hasMinRole(opts.orgRole, "admin")) {
    return opts.orgRole;
  }
  return opts.storeMemberRole;
}

export function hasMinStoreRole(
  role: StoreRole | null,
  min: StoreRole,
): boolean {
  if (!role) return false;
  return hasMinRole(role, min);
}

/**
 * Pick the active store from a verified cookie, else the first store
 * the actor can access. Never uses a client-supplied store id that
 * failed the access check (IDOR).
 */
export function resolveAccessibleStore(opts: {
  actorOrganizationId: string;
  orgRole: AccountRole;
  requestedStoreId: string | undefined;
  stores: StoreRecord[];
  memberships: Array<{ storeId: string; role: StoreRole }>;
}): { store: StoreRecord; role: StoreRole } | null {
  const memberByStore = new Map(
    opts.memberships.map((m) => [m.storeId, m.role]),
  );

  const accessible = opts.stores.filter((store) =>
    canAccessStore({
      actorOrganizationId: opts.actorOrganizationId,
      orgRole: opts.orgRole,
      store,
      storeMemberRole: memberByStore.get(store.id) ?? null,
    }),
  );

  if (accessible.length === 0) return null;

  const requested = opts.requestedStoreId
    ? accessible.find((s) => s.id === opts.requestedStoreId)
    : undefined;
  const store = requested ?? accessible[0];
  const role = effectiveStoreRole({
    orgRole: opts.orgRole,
    storeMemberRole: memberByStore.get(store.id) ?? null,
  });
  if (!role) return null;
  return { store, role };
}
