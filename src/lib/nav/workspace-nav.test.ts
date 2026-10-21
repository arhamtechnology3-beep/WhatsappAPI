import { describe, expect, it } from "vitest";
import { isNavActive, resolvePage, visibleNavItems, WORKSPACE_NAV } from "./workspace-nav";

describe("workspace nav", () => {
  it("keeps every primary feature in a named group", () => {
    const labels = WORKSPACE_NAV.flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual([
      "Dashboard",
      "Inbox",
      "Contacts",
      "Visitors",
      "Pipelines",
      "Customer 360",
      "Broadcasts",
      "CTWA Insights",
      "Shopify",
      "Campaigns",
      "Automations",
      "Flows",
      "Integrations",
    ]);
  });

  it("hides identity-flow items until the flag is on", () => {
    const customers = WORKSPACE_NAV.find((group) => group.id === "customers")!;
    expect(visibleNavItems(customers.items, false).map((item) => item.label)).not.toContain(
      "Customer 360",
    );
    expect(visibleNavItems(customers.items, true).map((item) => item.label)).toContain(
      "Customer 360",
    );
  });

  it("does not mark Shopify active on an unrelated path", () => {
    expect(isNavActive("/inbox", "/shopify")).toBe(false);
    expect(isNavActive("/shopify", "/shopify")).toBe(true);
  });

  it("names nested pages and hides the guide on the flow canvas", () => {
    expect(resolvePage("/broadcasts/new").label).toBe("New broadcast");
    expect(resolvePage("/flows/abc").hideGuide).toBe(true);
    expect(resolvePage("/dashboard").hideGuide).toBe(true);
    expect(resolvePage("/inbox").hideGuide).toBe(true);
    expect(resolvePage("/shopify").hideGuide).toBe(true);
    expect(resolvePage("/contacts").howTo).toMatch(/import/i);
  });
});
