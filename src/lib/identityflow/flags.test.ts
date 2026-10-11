import { afterEach, describe, expect, it } from "vitest";
import { isIdentityFlowNavEnabled } from "./flags";

const ORIGINAL = process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV;
  } else {
    process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV = ORIGINAL;
  }
});

describe("isIdentityFlowNavEnabled", () => {
  it("is off by default", () => {
    delete process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV;
    expect(isIdentityFlowNavEnabled()).toBe(false);
    expect(isIdentityFlowNavEnabled([])).toBe(false);
  });

  it("turns on via env", () => {
    process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV = "true";
    expect(isIdentityFlowNavEnabled()).toBe(true);
  });

  it("turns on via beta_features", () => {
    delete process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV;
    expect(isIdentityFlowNavEnabled(["identityflow"])).toBe(true);
    expect(isIdentityFlowNavEnabled(["flows"])).toBe(false);
  });
});
