import { describe, expect, it } from "vitest";
import { normalizeShopDomain } from "./store-credentials";

describe("normalizeShopDomain", () => {
  it("strips protocol and trailing slash", () => {
    expect(normalizeShopDomain("https://A.myshopify.com/")).toBe("a.myshopify.com");
  });

  it("rewrites the legacy custom domain", () => {
    expect(normalizeShopDomain("www.divyaprabhafoods.com")).toBe(
      "divyaprabhafoods.myshopify.com",
    );
  });
});
