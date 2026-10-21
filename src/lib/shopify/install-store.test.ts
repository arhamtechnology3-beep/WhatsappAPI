import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
}));

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/billing/owner-subscription", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/billing/owner-subscription")
  >("@/lib/billing/owner-subscription");
  return {
    ...actual,
    getOwnerSubscription: vi.fn(),
    getSubscriptionForOrganization: vi.fn(),
    ensureOwnerSubscription: vi.fn(),
  };
});

import {
  StoreInstallError,
  upsertInstalledStore,
} from "./install-store";
import {
  getOwnerSubscription,
  getSubscriptionForOrganization,
} from "@/lib/billing/owner-subscription";

type Row = Record<string, unknown>;

function createMockSupabase(state: {
  stores: Row[];
  connections: Row[];
  subscriptions: Row[];
  events: Row[];
  history: Row[];
}) {
  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    let filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let single = false;
    let maybeSingle = false;

    const runSelect = () => {
      let rows =
        table === "stores"
          ? state.stores
          : table === "shopify_connections"
            ? state.connections
            : table === "subscriptions"
              ? state.subscriptions
              : table === "shop_trial_history"
                ? state.history
                : table === "subscription_events"
                  ? state.events
                  : table === "store_members"
                    ? []
                    : [];
      rows = rows.filter((r) => filters.every((f) => f(r)));
      if (maybeSingle || single) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    };

    const thenable = {
      select(_cols?: string) {
        return thenable;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return thenable;
      },
      maybeSingle() {
        maybeSingle = true;
        return Promise.resolve(runSelect());
      },
      single() {
        single = true;
        if (mode === "insert" && payload) {
          const row = { id: `new-${table}-${state.stores.length + 1}`, ...payload };
          if (table === "stores") state.stores.push(row);
          if (table === "subscriptions") state.subscriptions.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve(runSelect());
      },
      insert(row: Row) {
        mode = "insert";
        payload = row;
        if (table === "subscription_events") {
          state.events.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        if (table === "shop_trial_history") {
          state.history.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        if (table === "store_members") {
          return Promise.resolve({ data: row, error: null });
        }
        return thenable;
      },
      update(row: Row) {
        mode = "update";
        payload = row;
        return {
          eq(col: string, val: unknown) {
            const list =
              table === "stores"
                ? state.stores
                : table === "subscriptions"
                  ? state.subscriptions
                  : table === "workspaces"
                    ? []
                    : table === "shopify_connections"
                      ? state.connections
                      : [];
            for (const item of list) {
              if (item[col] === val) Object.assign(item, row);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      upsert(row: Row) {
        mode = "upsert";
        if (table === "shopify_connections") {
          const existing = state.connections.find(
            (c) => c.store_id === row.store_id,
          );
          if (existing) Object.assign(existing, row);
          else state.connections.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        if (table === "store_members") {
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: row, error: null });
      },
    };

    // Make `from().select().eq().maybeSingle()` work via thenable chain
    Object.assign(api, thenable);
    return thenable;
  };

  return { from } as any;
}

describe("upsertInstalledStore multi-tenant rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOwnerSubscription).mockResolvedValue(null);
    vi.mocked(getSubscriptionForOrganization).mockResolvedValue(null);
  });

  it("rejects installing a second shop domain into an organization that already has one", async () => {
    const state = {
      stores: [
        {
          id: "store-a",
          organization_id: "org-1",
          shop_domain: "a.myshopify.com",
          status: "active",
        },
      ],
      connections: [],
      subscriptions: [],
      events: [],
      history: [],
    };
    const supabase = createMockSupabase(state);

    await expect(
      upsertInstalledStore(supabase, {
        organizationId: "org-1",
        shopDomain: "b.myshopify.com",
        shopName: "Store B",
        accessToken: "tok",
        actorUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(StoreInstallError);
  });

  it("rejects claiming a shop owned by another organization", async () => {
    const state = {
      stores: [
        {
          id: "store-x",
          organization_id: "org-other",
          shop_domain: "taken.myshopify.com",
          status: "active",
        },
      ],
      connections: [],
      subscriptions: [],
      events: [],
      history: [],
    };
    const supabase = createMockSupabase(state);

    await expect(
      upsertInstalledStore(supabase, {
        organizationId: "org-1",
        shopDomain: "taken.myshopify.com",
        shopName: "Taken",
        accessToken: "tok",
        actorUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(StoreInstallError);
  });

  it("keeps ACTIVE on reinstall and does not insert a second subscription", async () => {
    const ownerSub = {
      id: "sub-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      storeId: "store-a",
      planId: "growth",
      status: "ACTIVE" as const,
      trialStart: new Date("2026-01-01T00:00:00.000Z"),
      trialEnd: new Date("2026-01-08T00:00:00.000Z"),
      maxOrganizations: 3,
    };
    vi.mocked(getOwnerSubscription).mockResolvedValue(ownerSub);
    vi.mocked(getSubscriptionForOrganization).mockResolvedValue(ownerSub);

    const state = {
      stores: [
        {
          id: "store-a",
          organization_id: "org-1",
          shop_domain: "a.myshopify.com",
          status: "uninstalled",
        },
      ],
      connections: [],
      subscriptions: [
        {
          id: "sub-1",
          owner_user_id: "user-1",
          organization_id: "org-1",
          store_id: "store-a",
          plan_id: "growth",
          status: "ACTIVE",
        },
      ],
      events: [],
      history: [
        {
          id: "hist-1",
          shop_domain: "a.myshopify.com",
          shopify_shop_id: "1",
          first_trial_started_at: "2026-01-01T00:00:00.000Z",
          first_trial_ended_at: "2026-01-08T00:00:00.000Z",
        },
      ],
    };
    const supabase = createMockSupabase(state);

    const result = await upsertInstalledStore(supabase, {
      organizationId: "org-1",
      shopDomain: "a.myshopify.com",
      shopName: "Store A",
      accessToken: "tok",
      actorUserId: "user-1",
    });

    expect(result.subscriptionStatus).toBe("ACTIVE");
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0].status).toBe("ACTIVE");
    expect(state.stores).toHaveLength(1);
  });
});
