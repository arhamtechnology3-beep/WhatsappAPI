import { describe, expect, it } from "vitest";
import {
  TRIAL_DAYS,
  entitlementsUnlocked,
  resolveInstallSubscription,
} from "./trial";

const NOW = new Date("2026-09-18T00:00:00.000Z");

describe("resolveInstallSubscription", () => {
  it("starts a 7-day UTC trial on first install", () => {
    const result = resolveInstallSubscription({ history: null, now: NOW });
    expect(result.status).toBe("TRIALING");
    expect(result.trialReused).toBe(false);
    expect(result.shouldRecordHistory).toBe(true);
    expect(result.trialStart?.toISOString()).toBe(NOW.toISOString());
    expect(result.trialEnd?.toISOString()).toBe(
      new Date(NOW.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("does not grant a new trial on reinstall after the window closed", () => {
    const result = resolveInstallSubscription({
      now: NOW,
      history: {
        shopDomain: "a.myshopify.com",
        shopifyShopId: "123",
        firstTrialStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        firstTrialEndedAt: new Date("2026-01-08T00:00:00.000Z"),
      },
    });
    expect(result.status).toBe("EXPIRED");
    expect(result.trialReused).toBe(true);
    expect(result.shouldRecordHistory).toBe(false);
    expect(result.trialStart?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.trialEnd?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("simulated reinstall after expiry never returns TRIALING", () => {
    const afterUninstall = resolveInstallSubscription({
      now: new Date("2026-09-18T00:00:00.000Z"),
      history: {
        shopDomain: "a.myshopify.com",
        shopifyShopId: "123",
        firstTrialStartedAt: new Date("2026-09-01T00:00:00.000Z"),
        firstTrialEndedAt: new Date("2026-09-08T00:00:00.000Z"),
      },
    });
    expect(afterUninstall.status).not.toBe("TRIALING");
    expect(afterUninstall.status).toBe("EXPIRED");
  });

  it("keeps original trial dates if reinstalled during the first window", () => {
    const start = new Date("2026-09-16T00:00:00.000Z");
    const end = new Date("2026-09-23T00:00:00.000Z");
    const result = resolveInstallSubscription({
      now: NOW,
      history: {
        shopDomain: "a.myshopify.com",
        shopifyShopId: "123",
        firstTrialStartedAt: start,
        firstTrialEndedAt: end,
      },
    });
    expect(result.status).toBe("TRIALING");
    expect(result.trialReused).toBe(true);
    expect(result.trialStart).toEqual(start);
    expect(result.trialEnd).toEqual(end);
  });

  it("stays ACTIVE when a paid subscription is already verified", () => {
    const result = resolveInstallSubscription({
      history: null,
      now: NOW,
      paidActive: true,
    });
    expect(result.status).toBe("ACTIVE");
    expect(result.shouldRecordHistory).toBe(false);
  });
});

describe("entitlementsUnlocked", () => {
  it("locks features when a trial row is past trial_end", () => {
    expect(
      entitlementsUnlocked({
        status: "TRIALING",
        trialEnd: new Date("2026-09-01T00:00:00.000Z"),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("unlocks during an open trial", () => {
    expect(
      entitlementsUnlocked({
        status: "TRIALING",
        trialEnd: new Date("2026-09-25T00:00:00.000Z"),
        now: NOW,
      }),
    ).toBe(true);
  });
});
