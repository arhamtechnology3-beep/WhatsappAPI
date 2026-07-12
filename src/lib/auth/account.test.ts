import { afterEach, describe, expect, it, vi } from "vitest";

// Workspace query mock builder
interface BuilderCall {
  table: string;
  columns?: string;
  eqArgs: [string, unknown][];
}

function makeClient(opts: {
  user: { id: string } | null;
  userErr?: unknown;
  byTable: Record<string, { data: unknown; error: unknown }>;
}) {
  const calls: BuilderCall[] = [];

  const from = (table: string) => {
    const call: BuilderCall = { table, eqArgs: [] };
    calls.push(call);
    const builder = {
      select(columns: string) {
        call.columns = columns;
        return builder;
      },
      eq(col: string, val: unknown) {
        call.eqArgs.push([col, val]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(
          opts.byTable[table] ?? { data: null, error: null },
        );
      },
    };
    return builder;
  };

  return {
    calls,
    client: {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: opts.user },
            error: opts.userErr ?? null,
          }),
      },
      from,
    },
  };
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

const { getCurrentAccount, UnauthorizedError, ForbiddenError } = await import(
  "./account"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAccount", () => {
  it("resolves context via a plain workspaces lookup, not an embedded join", async () => {
    const { client, calls } = makeClient({
      user: { id: "user-1" },
      byTable: {
        workspace_members: {
          data: { workspace_id: "ws-1", role: "owner" },
          error: null,
        },
        workspaces: { data: { id: "ws-1", name: "Acme" }, error: null },
      },
    });
    createClient.mockReturnValue(client);

    const ctx = await getCurrentAccount();

    expect(ctx).toMatchObject({
      userId: "user-1",
      accountId: "ws-1",
      role: "owner",
      account: { id: "ws-1", name: "Acme" },
    });

    expect(calls.map((c) => c.table)).toEqual(["workspace_members", "workspaces"]);
    expect(calls[0].columns).not.toMatch(/workspaces!/);
    expect(calls[0].eqArgs).toEqual([["user_id", "user-1"]]);
    expect(calls[1].columns).not.toMatch(/workspaces!/);
    expect(calls[1].eqArgs).toEqual([["id", "ws-1"]]);
  });

  it("throws UnauthorizedError when there is no session", async () => {
    const { client } = makeClient({ user: null, byTable: {} });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("maps a workspace_members query error to ForbiddenError", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      byTable: {
        workspace_members: { data: null, error: { code: "PGRST200", message: "fail" } },
      },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toThrow(
      "Profile is not linked to any workspace",
    );
  });

  it("maps a workspaces query error to 'Could not load workspace context'", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      byTable: {
        workspace_members: {
          data: { workspace_id: "ws-1", role: "admin" },
          error: null,
        },
        workspaces: { data: null, error: { code: "PGRST200", message: "fail" } },
      },
    });
    createClient.mockReturnValue(client);
    const err = await getCurrentAccount().catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toBe("Could not load workspace context");
  });

  it("rejects a user not linked to any workspace", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      byTable: {
        workspace_members: { data: null, error: null },
      },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toThrow(
      "Profile is not linked to any workspace",
    );
  });
});
