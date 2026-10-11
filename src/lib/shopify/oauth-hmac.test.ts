import { describe, expect, it } from "vitest";
import {
  verifyShopifyOAuthHmac,
  createOAuthState,
} from "./oauth-hmac";
import crypto from "node:crypto";

describe("verifyShopifyOAuthHmac", () => {
  it("accepts a valid timing-safe HMAC", () => {
    const secret = "test-secret";
    const params = new URLSearchParams({
      code: "abc",
      shop: "a.myshopify.com",
      state: "xyz",
      timestamp: "123",
    });
    const message = Array.from(params.entries())
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&");
    const hmac = crypto.createHmac("sha256", secret).update(message).digest("hex");
    params.set("hmac", hmac);
    expect(verifyShopifyOAuthHmac(params, secret)).toBe(true);
  });

  it("rejects a tampered HMAC", () => {
    const params = new URLSearchParams({
      code: "abc",
      shop: "a.myshopify.com",
      hmac: "deadbeef",
    });
    expect(verifyShopifyOAuthHmac(params, "test-secret")).toBe(false);
  });
});

describe("createOAuthState", () => {
  it("returns a non-empty hex string", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a.length).toBeGreaterThan(16);
    expect(a).not.toBe(b);
  });
});
