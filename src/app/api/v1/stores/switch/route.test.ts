import { afterEach, describe, expect, it, vi } from "vitest";

const getCurrentAccount = vi.fn();
const loadAccessibleStoreForActor = vi.fn();
const getStoreEntitlements = vi.fn();
const writeAuditLog = vi.fn();
const cookieSet = vi.fn();

vi.mock("@/lib/auth/account", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/account")>(
    "@/lib/auth/account",
  );
  return {
    ...actual,
    getCurrentAccount: () => getCurrentAccount(),
  };
});

vi.mock("@/lib/auth/store", () => ({
  loadAccessibleStoreForActor: (
    ...args: unknown[]
  ) => loadAccessibleStoreForActor(...args),
  getStoreEntitlements: (...args: unknown[]) => getStoreEntitlements(...args),
}));

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

const { POST } = await import("./route");
const { UnauthorizedError } = await import("@/lib/auth/account");

afterEach(() => {
  vi.clearAllMocks();
});

const ORG = "11111111-1111-1111-1111-111111111111";
const STORE = "22222222-2222-2222-2222-222222222222";
const FOREIGN = "33333333-3333-3333-3333-333333333333";

function account() {
  return {
    supabase: {},
    userId: "user-1",
    accountId: ORG,
    role: "owner",
    account: { id: ORG, name: "Org" },
  };
}

describe("POST /api/v1/stores/switch", () => {
  it("rejects unauthenticated callers", async () => {
    getCurrentAccount.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      new Request("http://localhost/api/v1/stores/switch", {
        method: "POST",
        body: JSON.stringify({ storeId: STORE }),
      }),
    );
    expect(res.status).toBe(401);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects a store ID from another organization (IDOR)", async () => {
    getCurrentAccount.mockResolvedValue(account());
    loadAccessibleStoreForActor.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/v1/stores/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId: FOREIGN }),
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("sets the httpOnly store cookie after access is verified", async () => {
    getCurrentAccount.mockResolvedValue(account());
    loadAccessibleStoreForActor.mockResolvedValue({
      store: {
        id: STORE,
        organizationId: ORG,
        name: "A",
        shopDomain: "a.myshopify.com",
        shopifyShopId: "1",
        status: "pending_install",
      },
      storeRole: "owner",
    });
    getStoreEntitlements.mockResolvedValue({
      storeId: STORE,
      status: "PENDING_INSTALL",
      plan: "growth",
      features: { campaigns: false },
      limits: { campaigns: 0 },
    });

    const res = await POST(
      new Request("http://localhost/api/v1/stores/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId: STORE }),
      }),
    );
    expect(res.status).toBe(200);
    expect(cookieSet).toHaveBeenCalledWith(
      "wacrm_active_store_id",
      STORE,
      expect.objectContaining({ httpOnly: true }),
    );
  });
});
