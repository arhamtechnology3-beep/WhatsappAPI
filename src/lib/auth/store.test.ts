import { afterEach, describe, expect, it, vi } from "vitest";

interface BuilderCall {
  table: string;
  eqArgs: [string, unknown][];
}

function makeClient(opts: {
  byTable: Record<string, { data: unknown; error: unknown }>;
}) {
  const calls: BuilderCall[] = [];
  const from = (table: string) => {
    const call: BuilderCall = { table, eqArgs: [] };
    calls.push(call);
    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        call.eqArgs.push([col, val]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(opts.byTable[table] ?? { data: null, error: null });
      },
      then(
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(
          opts.byTable[table] ?? { data: null, error: null },
        ).then(resolve, reject);
      },
    };
    return builder;
  };
  return { calls, client: { from } };
}

const getCurrentAccount = vi.fn();
vi.mock("./account", async () => {
  const actual = await vi.importActual<typeof import("./account")>("./account");
  return { ...actual, getCurrentAccount: () => getCurrentAccount() };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "store-foreign" }),
  }),
}));

const { getCurrentStore } = await import("./store");
const { ForbiddenError } = await import("./account");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentStore isolation", () => {
  it("does not activate a store cookie from another organization", async () => {
    const { client } = makeClient({
      byTable: {
        stores: {
          data: [
            {
              id: "store-own",
              organization_id: "org-1",
              name: "Own",
              shop_domain: "own.myshopify.com",
              shopify_shop_id: "1",
              status: "pending_install",
            },
          ],
          error: null,
        },
        store_members: {
          data: [{ store_id: "store-own", role: "owner" }],
          error: null,
        },
      },
    });

    getCurrentAccount.mockResolvedValue({
      supabase: client,
      userId: "user-1",
      accountId: "org-1",
      role: "owner",
      account: { id: "org-1", name: "Org" },
    });

    const ctx = await getCurrentStore();
    expect(ctx.store.id).toBe("store-own");
    expect(ctx.store.id).not.toBe("store-foreign");
  });

  it("throws when the org has no accessible store", async () => {
    const { client } = makeClient({
      byTable: {
        stores: { data: [], error: null },
        store_members: { data: [], error: null },
      },
    });
    getCurrentAccount.mockResolvedValue({
      supabase: client,
      userId: "user-1",
      accountId: "org-1",
      role: "agent",
      account: { id: "org-1", name: "Org" },
    });
    await expect(getCurrentStore()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
