import { describe, expect, it } from "vitest";

import {
  isProfilelessCallerError,
  redeemProfilelessInvite,
  workspaceRoleForInvite,
  type ProfilelessInviteDb,
  type ProfilelessInviteRow,
} from "./redeem-profileless";

function memoryDb(invite: ProfilelessInviteRow | null, opts?: { hasProfile?: boolean; markFails?: boolean }) {
  const profiles: string[] = [];
  const members: Array<{ workspace_id: string; user_id: string; role: string }> = [];
  let acceptedBy: string | null = invite?.accepted_at ? "someone" : null;

  const db: ProfilelessInviteDb = {
    async findInvite() {
      if (!invite) return null;
      return { ...invite, accepted_at: acceptedBy ? invite.accepted_at ?? new Date().toISOString() : null };
    },
    async hasProfile(userId) {
      return Boolean(opts?.hasProfile) || profiles.includes(userId);
    },
    async insertProfile(row) {
      profiles.push(row.user_id);
      return null;
    },
    async upsertMember(row) {
      members.push(row);
      return null;
    },
    async markAccepted(_inviteId, userId) {
      if (opts?.markFails || acceptedBy) {
        return { accepted: false, error: null };
      }
      acceptedBy = userId;
      return { accepted: true, error: null };
    },
    async rollbackAttach(userId) {
      const idx = profiles.indexOf(userId);
      if (idx >= 0) profiles.splice(idx, 1);
      for (let i = members.length - 1; i >= 0; i--) {
        if (members[i].user_id === userId) members.splice(i, 1);
      }
    },
  };

  return { db, profiles, members, acceptedBy: () => acceptedBy };
}

const invite: ProfilelessInviteRow = {
  id: "inv-1",
  account_id: "acct-1",
  role: "agent",
  expires_at: "2026-11-11T00:00:00.000Z",
  accepted_at: null,
};

const now = new Date("2026-10-12T12:00:00.000Z");

describe("isProfilelessCallerError", () => {
  it("matches the redeem_invitation refusal", () => {
    expect(
      isProfilelessCallerError({ code: "42501", message: "Caller has no profile" }),
    ).toBe(true);
  });

  it("ignores other unauthorized errors", () => {
    expect(isProfilelessCallerError({ code: "42501", message: "Unauthorized" })).toBe(
      false,
    );
    expect(isProfilelessCallerError({ code: "23505", message: "Caller has no profile" })).toBe(
      false,
    );
  });
});

describe("workspaceRoleForInvite", () => {
  it("maps admin to admin and agent/viewer to member", () => {
    expect(workspaceRoleForInvite("admin")).toBe("admin");
    expect(workspaceRoleForInvite("agent")).toBe("member");
    expect(workspaceRoleForInvite("viewer")).toBe("member");
  });
});

describe("redeemProfilelessInvite", () => {
  it("attaches a profile-less user to the invited account as a member", async () => {
    const mem = memoryDb(invite);
    const result = await redeemProfilelessInvite(mem.db, {
      tokenHash: "hash",
      userId: "user-1",
      email: "shraddha@example.com",
      fullName: "Shraddha",
      now,
    });

    expect(result).toEqual({ ok: true, accountId: "acct-1" });
    expect(mem.profiles).toEqual(["user-1"]);
    expect(mem.members).toEqual([
      { workspace_id: "acct-1", user_id: "user-1", role: "member" },
    ]);
    expect(mem.acceptedBy()).toBe("user-1");
  });

  it("refuses when the caller already has a profile", async () => {
    const mem = memoryDb(invite, { hasProfile: true });
    const result = await redeemProfilelessInvite(mem.db, {
      tokenHash: "hash",
      userId: "user-1",
      email: "a@example.com",
      fullName: "A",
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(mem.profiles).toEqual([]);
  });

  it("rolls the profile back when the invite was redeemed concurrently", async () => {
    const mem = memoryDb(invite, { markFails: true });
    const result = await redeemProfilelessInvite(mem.db, {
      tokenHash: "hash",
      userId: "user-1",
      email: "a@example.com",
      fullName: "A",
      now,
    });
    expect(result.ok).toBe(false);
    expect(mem.profiles).toEqual([]);
    expect(mem.members).toEqual([]);
  });

  it("refuses an expired invite", async () => {
    const mem = memoryDb({ ...invite, expires_at: "2026-10-01T00:00:00.000Z" });
    const result = await redeemProfilelessInvite(mem.db, {
      tokenHash: "hash",
      userId: "user-1",
      email: "a@example.com",
      fullName: "A",
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
