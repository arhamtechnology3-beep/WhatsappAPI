import { describe, expect, it } from "vitest";
import { resolveAccessibleStore, type StoreRecord } from "@/lib/auth/store-access";
import { computeStoreEntitlements, LOCKED_FEATURES } from "@/lib/billing/entitlements";
import { resolveInstallSubscription } from "@/lib/billing/trial";
import { transitionSubscription } from "@/lib/billing/subscription-state";

/**
 * Spec e2e scenarios (unit-level): two stores, trial vs paid isolation,
 * reinstall does not reset trial, paid features blocked when expired.
 */
describe("IdentityFlow isolation e2e (unit)", () => {
  const storeA: StoreRecord = {
    id: "store-a",
    organizationId: "org-1",
    name: "A",
    shopDomain: "a.myshopify.com",
    shopifyShopId: "1",
    status: "active",
  };
  const storeB: StoreRecord = {
    id: "store-b",
    organizationId: "org-1",
    name: "B",
    shopDomain: "b.myshopify.com",
    shopifyShopId: "2",
    status: "active",
  };

  const growth = {
    planId: "growth",
    featureEntitlements: {
      visitorTracking: true,
      otpLogin: true,
      passkeys: true,
      campaigns: true,
      advancedSegments: true,
      whatsappAutomation: true,
    },
    usageLimits: { monthlyTrackedEvents: 100000, campaigns: 20 },
  };

  it("Store A ACTIVE and Store B TRIALING stay independent", () => {
    const a = computeStoreEntitlements({
      store: storeA,
      actor: {
        userId: "u1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: { status: "ACTIVE", planId: "growth" },
      plan: growth,
    });
    const b = computeStoreEntitlements({
      store: storeB,
      actor: {
        userId: "u1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: {
        status: "TRIALING",
        planId: "growth",
        trialEnd: new Date("2099-01-01"),
      },
      plan: growth,
    });
    expect(a.status).toBe("ACTIVE");
    expect(b.status).toBe("TRIALING");
    expect(a.features.campaigns).toBe(true);
    expect(b.features.campaigns).toBe(true);
  });

  it("expiring Store A does not change Store B", () => {
    const a = computeStoreEntitlements({
      store: storeA,
      actor: {
        userId: "u1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: {
        status: "TRIALING",
        planId: "growth",
        trialEnd: new Date("2020-01-01"),
      },
      plan: growth,
    });
    const b = computeStoreEntitlements({
      store: storeB,
      actor: {
        userId: "u1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: {
        status: "TRIALING",
        planId: "growth",
        trialEnd: new Date("2099-01-01"),
      },
      plan: growth,
    });
    expect(a.status).toBe("EXPIRED");
    expect(a.features).toEqual(LOCKED_FEATURES);
    expect(b.status).toBe("TRIALING");
    expect(b.features.campaigns).toBe(true);
  });

  it("reinstall after trial does not grant a new trial", () => {
    const history = {
      shopDomain: "a.myshopify.com",
      shopifyShopId: "1",
      firstTrialStartedAt: new Date("2026-01-01T00:00:00.000Z"),
      firstTrialEndedAt: new Date("2026-01-08T00:00:00.000Z"),
    };
    // uninstall → reinstall state machine
    expect(transitionSubscription("TRIALING", "UNINSTALLED")).toBe("UNINSTALLED");
    expect(transitionSubscription("UNINSTALLED", "REINSTALLED")).toBe(
      "PENDING_INSTALL",
    );
    const again = resolveInstallSubscription({
      history,
      now: new Date("2026-09-18T00:00:00.000Z"),
    });
    expect(again.status).toBe("EXPIRED");
    expect(again.trialReused).toBe(true);
  });

  it("agent cannot switch into a store without membership (IDOR)", () => {
    const resolved = resolveAccessibleStore({
      actorOrganizationId: "org-1",
      orgRole: "agent",
      requestedStoreId: storeA.id,
      stores: [storeA, storeB],
      memberships: [{ storeId: storeB.id, role: "agent" }],
    });
    expect(resolved?.store.id).toBe("store-b");
  });
});
