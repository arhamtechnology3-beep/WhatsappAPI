import { describe, expect, it } from "vitest";
import { normalizeWamid, wamidLookupKeys, wamidsEqual } from "./wamid";

describe("normalizeWamid", () => {
  it("strips the wamid. prefix", () => {
    expect(normalizeWamid("wamid.HBgN")).toBe("HBgN");
    expect(normalizeWamid("WAMID.HBgN")).toBe("HBgN");
  });

  it("leaves a bare id unchanged", () => {
    expect(normalizeWamid("HBgN")).toBe("HBgN");
  });
});

describe("wamidLookupKeys", () => {
  it("includes prefixed and bare forms", () => {
    expect(wamidLookupKeys("wamid.HBgN")).toEqual(
      expect.arrayContaining(["wamid.HBgN", "HBgN"]),
    );
  });
});

describe("wamidsEqual", () => {
  it("matches prefixed against bare", () => {
    expect(wamidsEqual("wamid.HBgN", "HBgN")).toBe(true);
  });

  it("rejects empty", () => {
    expect(wamidsEqual("", "HBgN")).toBe(false);
    expect(wamidsEqual(null, "HBgN")).toBe(false);
  });
});
