import { describe, expect, it } from "vitest";
import {
  canAccessStore,
  effectiveStoreRole,
  resolveAccessibleStore,
  type StoreRecord,
} from "./store-access";

const STORE_A: StoreRecord = {
  id: "store-a",
  organizationId: "org-1",
  name: "Store A",
  shopDomain: "a.myshopify.com",
  shopifyShopId: "1",
  status: "active",
};

const STORE_B: StoreRecord = {
  id: "store-b",
  organizationId: "org-2",
  name: "Store B",
  shopDomain: "b.myshopify.com",
  shopifyShopId: "2",
  status: "active",
};

describe("canAccessStore", () => {
  it("blocks cross-organization access even for owners", () => {
    expect(
      canAccessStore({
        actorOrganizationId: "org-1",
        orgRole: "owner",
        store: STORE_B,
        storeMemberRole: "owner",
      }),
    ).toBe(false);
  });

  it("allows org admins without a store_members row", () => {
    expect(
      canAccessStore({
        actorOrganizationId: "org-1",
        orgRole: "admin",
        store: STORE_A,
        storeMemberRole: null,
      }),
    ).toBe(true);
  });

  it("requires store_members for agents", () => {
    expect(
      canAccessStore({
        actorOrganizationId: "org-1",
        orgRole: "agent",
        store: STORE_A,
        storeMemberRole: null,
      }),
    ).toBe(false);
    expect(
      canAccessStore({
        actorOrganizationId: "org-1",
        orgRole: "agent",
        store: STORE_A,
        storeMemberRole: "agent",
      }),
    ).toBe(true);
  });
});

describe("resolveAccessibleStore", () => {
  it("ignores a requested store the actor cannot access (IDOR)", () => {
    const resolved = resolveAccessibleStore({
      actorOrganizationId: "org-1",
      orgRole: "owner",
      requestedStoreId: STORE_B.id,
      stores: [STORE_A, STORE_B],
      memberships: [],
    });
    expect(resolved?.store.id).toBe("store-a");
  });

  it("returns null when the org has no accessible stores", () => {
    const resolved = resolveAccessibleStore({
      actorOrganizationId: "org-1",
      orgRole: "viewer",
      requestedStoreId: STORE_A.id,
      stores: [STORE_A],
      memberships: [],
    });
    expect(resolved).toBeNull();
  });

  it("uses the requested store when membership allows it", () => {
    const second: StoreRecord = { ...STORE_A, id: "store-a2", name: "A2" };
    const resolved = resolveAccessibleStore({
      actorOrganizationId: "org-1",
      orgRole: "agent",
      requestedStoreId: "store-a2",
      stores: [STORE_A, second],
      memberships: [
        { storeId: "store-a", role: "agent" },
        { storeId: "store-a2", role: "viewer" },
      ],
    });
    expect(resolved?.store.id).toBe("store-a2");
    expect(resolved?.role).toBe("viewer");
  });
});

describe("effectiveStoreRole", () => {
  it("keeps org owner role on every store", () => {
    expect(
      effectiveStoreRole({ orgRole: "owner", storeMemberRole: "viewer" }),
    ).toBe("owner");
  });
});
