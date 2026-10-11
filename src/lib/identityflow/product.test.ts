import { afterEach, describe, expect, it } from "vitest";
import { getProductName } from "./product";

const ORIGINAL = process.env.NEXT_PUBLIC_PRODUCT_NAME;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_PRODUCT_NAME;
  else process.env.NEXT_PUBLIC_PRODUCT_NAME = ORIGINAL;
});

describe("getProductName", () => {
  it("defaults to IdentityFlow", () => {
    delete process.env.NEXT_PUBLIC_PRODUCT_NAME;
    expect(getProductName()).toBe("IdentityFlow");
  });

  it("uses the env override", () => {
    process.env.NEXT_PUBLIC_PRODUCT_NAME = "AcmeID";
    expect(getProductName()).toBe("AcmeID");
  });
});
