import { describe, expect, it } from "vitest";
import {
  organizationCreationAllowed,
  type OwnerSubscriptionRow,
} from "./owner-subscription";

const NOW = new Date("2026-10-21T00:00:00.000Z");

function sub(
  overrides: Partial<OwnerSubscriptionRow> = {},
): OwnerSubscriptionRow {
  return {
    id: "sub-1",
    ownerUserId: "user-1",
    organizationId: "org-1",
    storeId: "store-1",
    planId: "growth",
    status: "TRIALING",
    trialStart: new Date("2026-10-18T00:00:00.000Z"),
    trialEnd: new Date("2026-10-25T00:00:00.000Z"),
    maxOrganizations: 3,
    ...overrides,
  };
}

describe("organizationCreationAllowed", () => {
  it("allows the first organization with no subscription yet", () => {
    expect(
      organizationCreationAllowed({
        subscription: null,
        ownedCount: 0,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("allows a second and third org on growth while trialing", () => {
    expect(
      organizationCreationAllowed({
        subscription: sub(),
        ownedCount: 1,
        now: NOW,
      }).ok,
    ).toBe(true);
    expect(
      organizationCreationAllowed({
        subscription: sub(),
        ownedCount: 2,
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("rejects a fourth organization on a 3-org plan", () => {
    const result = organizationCreationAllowed({
      subscription: sub({ status: "ACTIVE", maxOrganizations: 3 }),
      ownedCount: 3,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/allows 3/);
    }
  });

  it("rejects when trial expired", () => {
    const result = organizationCreationAllowed({
      subscription: sub({
        trialEnd: new Date("2026-10-01T00:00:00.000Z"),
      }),
      ownedCount: 1,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when subscription is CANCELLED", () => {
    const result = organizationCreationAllowed({
      subscription: sub({ status: "CANCELLED" }),
      ownedCount: 1,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("allows under ACTIVE paid plan", () => {
    expect(
      organizationCreationAllowed({
        subscription: sub({ status: "ACTIVE", maxOrganizations: 3 }),
        ownedCount: 2,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });
});
