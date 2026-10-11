import { describe, expect, it } from "vitest";
import { computeStoreEntitlements, LOCKED_FEATURES } from "./entitlements";
import type { StoreRecord } from "@/lib/auth/store-access";

const STORE_A: StoreRecord = {
  id: "store-a",
  organizationId: "org-1",
  name: "A",
  shopDomain: "a.myshopify.com",
  shopifyShopId: "1",
  status: "active",
};

const STORE_B: StoreRecord = {
  id: "store-b",
  organizationId: "org-2",
  name: "B",
  shopDomain: "b.myshopify.com",
  shopifyShopId: "2",
  status: "active",
};

const GROWTH_PLAN = {
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

describe("computeStoreEntitlements", () => {
  it("ignores a client-claimed plan name", () => {
    const result = computeStoreEntitlements({
      store: STORE_A,
      actor: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: {
        status: "ACTIVE",
        planId: "starter",
      },
      plan: {
        planId: "starter",
        featureEntitlements: GROWTH_PLAN.featureEntitlements,
        usageLimits: { monthlyTrackedEvents: 25000, campaigns: 5 },
      },
      claimedPlan: "scale",
    });
    expect(result.plan).toBe("starter");
    expect(result.plan).not.toBe("scale");
  });

  it("returns locked features for a foreign store (IDOR)", () => {
    const result = computeStoreEntitlements({
      store: STORE_B,
      actor: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: null,
      },
      subscription: { status: "ACTIVE", planId: "growth" },
      plan: GROWTH_PLAN,
    });
    expect(result.features).toEqual(LOCKED_FEATURES);
    expect(result.limits.campaigns).toBe(0);
  });

  it("unlocks plan features while trialing", () => {
    const result = computeStoreEntitlements({
      store: STORE_A,
      actor: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "owner",
        storeMemberRole: "owner",
      },
      subscription: {
        status: "TRIALING",
        planId: "growth",
        trialEnd: new Date("2099-01-01T00:00:00.000Z"),
      },
      plan: GROWTH_PLAN,
    });
    expect(result.status).toBe("TRIALING");
    expect(result.features.campaigns).toBe(true);
    expect(result.limits.campaigns).toBe(20);
  });

  it("locks paid features after trial expiry even if status is still TRIALING", () => {
    const result = computeStoreEntitlements({
      store: STORE_A,
      actor: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "admin",
        storeMemberRole: null,
      },
      subscription: {
        status: "TRIALING",
        planId: "growth",
        trialEnd: new Date("2020-01-01T00:00:00.000Z"),
      },
      plan: GROWTH_PLAN,
    });
    expect(result.status).toBe("EXPIRED");
    expect(result.features).toEqual(LOCKED_FEATURES);
  });
});
