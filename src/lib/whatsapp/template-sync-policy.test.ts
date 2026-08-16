import { describe, expect, it } from "vitest";
import {
  isSkippedMetaCatalogTemplate,
  shouldImportNewMetaTemplate,
} from "./template-sync-policy";

describe("isSkippedMetaCatalogTemplate", () => {
  it("skips Shopify recipe names and Meta samples", () => {
    expect(isSkippedMetaCatalogTemplate("wacrm_cart_abandoned_v1")).toBe(true);
    expect(isSkippedMetaCatalogTemplate("wacrm_order_confirmed_v1")).toBe(true);
    expect(isSkippedMetaCatalogTemplate("3p_direct_integration_test_template")).toBe(
      true,
    );
    expect(isSkippedMetaCatalogTemplate("hello_world")).toBe(true);
    expect(isSkippedMetaCatalogTemplate("sample_shipping_update")).toBe(true);
  });

  it("allows merchant-created names", () => {
    expect(isSkippedMetaCatalogTemplate("order_ready_pickup")).toBe(false);
    expect(isSkippedMetaCatalogTemplate("divyaprabha_welcome")).toBe(false);
  });
});

describe("shouldImportNewMetaTemplate", () => {
  it("never inserts templates that are not already in wacrm", () => {
    expect(shouldImportNewMetaTemplate()).toBe(false);
  });
});
