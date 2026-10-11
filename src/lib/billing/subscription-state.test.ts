import { describe, expect, it } from "vitest";
import {
  IllegalSubscriptionTransitionError,
  paidFeaturesUnlocked,
  transitionSubscription,
} from "./subscription-state";

describe("transitionSubscription", () => {
  it("starts a trial only after install", () => {
    expect(transitionSubscription("PENDING_INSTALL", "INSTALL_SUCCEEDED")).toBe(
      "TRIALING",
    );
  });

  it("activates a verified paid subscription from trial", () => {
    expect(transitionSubscription("TRIALING", "SUBSCRIPTION_APPROVED")).toBe(
      "ACTIVE",
    );
  });

  it("expires a trial", () => {
    expect(transitionSubscription("TRIALING", "TRIAL_EXPIRED")).toBe("EXPIRED");
  });

  it("can uninstall from any live state", () => {
    expect(transitionSubscription("ACTIVE", "UNINSTALLED")).toBe("UNINSTALLED");
    expect(transitionSubscription("TRIALING", "UNINSTALLED")).toBe("UNINSTALLED");
    expect(transitionSubscription("EXPIRED", "UNINSTALLED")).toBe("UNINSTALLED");
  });

  it("reinstall returns to PENDING_INSTALL, not TRIALING", () => {
    expect(transitionSubscription("UNINSTALLED", "REINSTALLED")).toBe(
      "PENDING_INSTALL",
    );
  });

  it("does not treat uninstall as a fresh trial start", () => {
    expect(() =>
      transitionSubscription("UNINSTALLED", "INSTALL_SUCCEEDED"),
    ).toThrow(IllegalSubscriptionTransitionError);
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      transitionSubscription("ACTIVE", "INSTALL_SUCCEEDED"),
    ).toThrow(IllegalSubscriptionTransitionError);
  });
});

describe("paidFeaturesUnlocked", () => {
  it("unlocks only trialing and active", () => {
    expect(paidFeaturesUnlocked("TRIALING")).toBe(true);
    expect(paidFeaturesUnlocked("ACTIVE")).toBe(true);
    expect(paidFeaturesUnlocked("EXPIRED")).toBe(false);
    expect(paidFeaturesUnlocked("PENDING_INSTALL")).toBe(false);
    expect(paidFeaturesUnlocked("UNINSTALLED")).toBe(false);
    expect(paidFeaturesUnlocked("CANCELLED")).toBe(false);
  });
});
