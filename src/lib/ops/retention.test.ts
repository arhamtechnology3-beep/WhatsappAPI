import { describe, expect, it } from "vitest";
import {
  isSupportGrantActive,
  reconcileTrialExpiry,
} from "./retention";

describe("isSupportGrantActive", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");

  it("is active before expiry", () => {
    expect(
      isSupportGrantActive({
        expiresAt: new Date("2026-09-18T16:00:00.000Z"),
        revokedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("is inactive when revoked or expired", () => {
    expect(
      isSupportGrantActive({
        expiresAt: new Date("2026-09-18T16:00:00.000Z"),
        revokedAt: now,
        now,
      }),
    ).toBe(false);
    expect(
      isSupportGrantActive({
        expiresAt: new Date("2026-09-18T10:00:00.000Z"),
        revokedAt: null,
        now,
      }),
    ).toBe(false);
  });
});

describe("reconcileTrialExpiry", () => {
  it("marks past-due TRIALING rows as EXPIRED", async () => {
    const updates: unknown[] = [];
    const events: unknown[] = [];
    const supabase = {
      from(table: string) {
        if (table === "subscriptions") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            lt() {
              return Promise.resolve({
                data: [
                  {
                    id: "sub-1",
                    store_id: "store-1",
                    organization_id: "org-1",
                    status: "TRIALING",
                    trial_end: "2026-01-01T00:00:00.000Z",
                  },
                ],
              });
            },
            update(payload: unknown) {
              updates.push(payload);
              return {
                eq() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        if (table === "subscription_events") {
          return {
            insert(payload: unknown) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(table);
      },
    };

    const n = await reconcileTrialExpiry(supabase as never, new Date("2026-09-18T00:00:00.000Z"));
    expect(n).toBe(1);
    expect(updates[0]).toMatchObject({ status: "EXPIRED" });
    expect(events[0]).toMatchObject({ to_status: "EXPIRED", event: "TRIAL_EXPIRED" });
  });
});
