import { describe, expect, it } from "vitest";
import { pickCookieTenantIds } from "./active-workspace";

describe("pickCookieTenantIds", () => {
  it("ignores workspace_id, store_id, and organization_id query params", () => {
    const query = new URLSearchParams({
      workspace_id: "attacker-org",
      store_id: "attacker-store",
      organization_id: "attacker-org",
    });
    const picked = pickCookieTenantIds({
      query,
      cookieWorkspaceId: "real-org",
      cookieStoreId: "real-store",
    });
    expect(picked.workspaceId).toBe("real-org");
    expect(picked.storeId).toBe("real-store");
    expect(picked.ignoredQueryKeys).toEqual([
      "workspace_id",
      "store_id",
      "organization_id",
    ]);
  });

  it("does not invent a workspace id from the query when the cookie is empty", () => {
    const query = new URLSearchParams({ workspace_id: "attacker-org" });
    const picked = pickCookieTenantIds({ query });
    expect(picked.workspaceId).toBeUndefined();
  });
});
