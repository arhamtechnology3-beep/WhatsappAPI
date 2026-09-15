import { describe, expect, it } from "vitest";
import { renderTemplateBody } from "./render-template-body";

describe("renderTemplateBody", () => {
  it("substitutes 1-indexed {{n}} placeholders", () => {
    expect(renderTemplateBody("Hi {{1}}, your cart is {{2}}", ["Vidhi", "ready"])).toBe(
      "Hi Vidhi, your cart is ready",
    );
  });

  it("leaves missing params as the original placeholder", () => {
    expect(renderTemplateBody("Hi {{1}} {{2}}", ["Vidhi"])).toBe("Hi Vidhi {{2}}");
  });

  it("returns empty string for a null body", () => {
    expect(renderTemplateBody(null, ["x"])).toBe("");
  });
});
