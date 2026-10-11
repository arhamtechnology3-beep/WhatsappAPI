import { describe, expect, it } from "vitest";
import {
  isAllowedTrackingEvent,
  sanitizeEventPayload,
  signStorefrontPayload,
  verifyStorefrontSignature,
} from "./events";

describe("tracking events helpers", () => {
  it("allows documented event names only", () => {
    expect(isAllowedTrackingEvent("page_viewed")).toBe(true);
    expect(isAllowedTrackingEvent("evil_event")).toBe(false);
  });

  it("strips payment-like payload keys", () => {
    const clean = sanitizeEventPayload({
      path: "/cart",
      card_number: "4111",
      cvv: "123",
      ok: true,
    });
    expect(clean.path).toBe("/cart");
    expect(clean.ok).toBe(true);
    expect(clean.card_number).toBeUndefined();
    expect(clean.cvv).toBeUndefined();
  });

  it("verifies storefront HMAC signatures", () => {
    const storeId = "11111111-1111-1111-1111-111111111111";
    const timestamp = String(Date.now());
    const body = '{"a":1}';
    const secret = "storefront-secret";
    const signature = signStorefrontPayload(storeId, timestamp, body, secret);
    expect(
      verifyStorefrontSignature({
        storeId,
        timestamp,
        body,
        signature,
        secret,
      }),
    ).toBe(true);
    expect(
      verifyStorefrontSignature({
        storeId,
        timestamp,
        body,
        signature: "nope",
        secret,
      }),
    ).toBe(false);
  });
});
