import { afterEach, describe, expect, it, vi } from "vitest";
import {
  explainUnsupportedMetaObjectError,
  resolveMetaAppIdForToken,
} from "./meta-api";

describe("explainUnsupportedMetaObjectError", () => {
  it("rewrites Unsupported post request object errors", () => {
    const raw =
      "Unsupported post request. Object with ID '1237128812817964' does not exist, cannot be loaded due to missing permissions, or does not support this operation.";
    const out = explainUnsupportedMetaObjectError(raw);
    expect(out).toContain("1237128812817964");
    expect(out).toMatch(/META_APP_ID/);
    expect(out).toMatch(/WABA/);
  });

  it("rewrites duplicate English (US) name errors", () => {
    const raw =
      "There is already English (US) content for this template. You can create a new template and try again. (Invalid parameter) [#100]";
    const out = explainUnsupportedMetaObjectError(raw);
    expect(out).toMatch(/wacrm_cart_abandoned_v4/);
    expect(out).not.toMatch(/Track Order cannot use/);
  });

  it("rewrites category mismatch without the Track Order hint", () => {
    const raw =
      "The category UTILITY doesn't match the one that's already associated with this template, MARKETING. (Invalid parameter) [#100]";
    const out = explainUnsupportedMetaObjectError(raw);
    expect(out).toMatch(/category cannot be changed/i);
    expect(out).not.toMatch(/Track Order cannot use/);
  });

  it("rewrites bare Invalid parameter for Utility dynamic URL buttons", () => {
    const out = explainUnsupportedMetaObjectError("Invalid parameter");
    expect(out).toMatch(/account\/orders/);
  });

  it("leaves other errors unchanged", () => {
    expect(explainUnsupportedMetaObjectError("Header image URL returned 404.")).toBe(
      "Header image URL returned 404.",
    );
  });
});

describe("resolveMetaAppIdForToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prefers app_id from debug_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { app_id: "token-app" } }),
      })),
    );
    await expect(resolveMetaAppIdForToken("tok")).resolves.toBe("token-app");
  });

  it("falls back to META_APP_ID when debug_token has no app_id", async () => {
    vi.stubEnv("META_APP_ID", "env-app");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
    );
    await expect(resolveMetaAppIdForToken("tok")).resolves.toBe("env-app");
  });
});
