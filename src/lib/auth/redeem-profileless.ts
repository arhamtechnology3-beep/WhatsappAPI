// Safety net for redeem_invitation's "Caller has no profile" refusal.
//
// Until migration 055 is applied, signup can commit an auth user
// whose profile insert was rolled back inside handle_new_user().
// The RPC then refuses. This path attaches that login to the
// invited account directly. It does not run when a profile already
// exists — that case must stay inside the RPC, which refuses to
// abandon an account that already has data.

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/automations/admin-client";

export type InviteAccountRole = "admin" | "agent" | "viewer";

export interface ProfilelessInviteRow {
  id: string;
  account_id: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface ProfilelessInviteDb {
  findInvite(tokenHash: string): Promise<ProfilelessInviteRow | null>;
  hasProfile(userId: string): Promise<boolean>;
  insertProfile(row: {
    user_id: string;
    full_name: string;
    email: string;
    account_id: string;
    account_role: InviteAccountRole;
  }): Promise<string | null>;
  upsertMember(row: {
    workspace_id: string;
    user_id: string;
    role: "admin" | "member";
  }): Promise<string | null>;
  markAccepted(inviteId: string, userId: string): Promise<{
    accepted: boolean;
    error: string | null;
  }>;
  rollbackAttach(userId: string, workspaceId: string): Promise<void>;
}

export type RedeemProfilelessResult =
  | { ok: true; accountId: string }
  | { ok: false; status: number; error: string };

const INVITE_ROLES: readonly InviteAccountRole[] = ["admin", "agent", "viewer"];

export function isProfilelessCallerError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error || error.code !== "42501") return false;
  return (error.message ?? "").includes("Caller has no profile");
}

export function workspaceRoleForInvite(
  role: InviteAccountRole,
): "admin" | "member" {
  return role === "admin" ? "admin" : "member";
}

function asInviteRole(role: string): InviteAccountRole | null {
  return (INVITE_ROLES as readonly string[]).includes(role)
    ? (role as InviteAccountRole)
    : null;
}

export async function redeemProfilelessInvite(
  db: ProfilelessInviteDb,
  input: {
    tokenHash: string;
    userId: string;
    email: string;
    fullName: string;
    now?: Date;
  },
): Promise<RedeemProfilelessResult> {
  const now = input.now ?? new Date();
  const invite = await db.findInvite(input.tokenHash);
  if (!invite) {
    return { ok: false, status: 400, error: "Invitation not found" };
  }
  if (invite.accepted_at) {
    return {
      ok: false,
      status: 400,
      error: "Invitation has already been redeemed",
    };
  }
  if (new Date(invite.expires_at).getTime() <= now.getTime()) {
    return { ok: false, status: 400, error: "Invitation has expired" };
  }

  const role = asInviteRole(invite.role);
  if (!role) {
    return { ok: false, status: 400, error: "Invitation role is not valid" };
  }

  // A profile appearing between the RPC and this call means the
  // caller is no longer the empty-signup case. Refuse rather than
  // overwrite an account that may hold data.
  if (await db.hasProfile(input.userId)) {
    return {
      ok: false,
      status: 409,
      error:
        "Your account already contains data; sign up with a different email to join this one",
    };
  }

  const profileError = await db.insertProfile({
    user_id: input.userId,
    full_name: input.fullName,
    email: input.email,
    account_id: invite.account_id,
    account_role: role,
  });
  if (profileError) {
    return { ok: false, status: 500, error: "Failed to redeem invitation" };
  }

  const memberError = await db.upsertMember({
    workspace_id: invite.account_id,
    user_id: input.userId,
    role: workspaceRoleForInvite(role),
  });
  if (memberError) {
    await db.rollbackAttach(input.userId, invite.account_id);
    return { ok: false, status: 500, error: "Failed to redeem invitation" };
  }

  const marked = await db.markAccepted(invite.id, input.userId);
  if (marked.error || !marked.accepted) {
    await db.rollbackAttach(input.userId, invite.account_id);
    return {
      ok: false,
      status: 400,
      error: marked.error ?? "Invitation has already been redeemed",
    };
  }

  return { ok: true, accountId: invite.account_id };
}

export function profilelessInviteDb(admin: SupabaseClient): ProfilelessInviteDb {
  return {
    async findInvite(tokenHash) {
      const { data, error } = await admin
        .from("account_invitations")
        .select("id, account_id, role, expires_at, accepted_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        console.error("[redeem-profileless] invite lookup:", error);
        return null;
      }
      return (data as ProfilelessInviteRow | null) ?? null;
    },
    async hasProfile(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("[redeem-profileless] profile lookup:", error);
        // Treat a lookup failure as "has a profile" so we refuse
        // instead of attaching a second membership blindly.
        return true;
      }
      return Boolean(data);
    },
    async insertProfile(row) {
      const { error } = await admin.from("profiles").insert(row);
      if (error) {
        console.error("[redeem-profileless] profile insert:", error);
        return error.message;
      }
      return null;
    },
    async upsertMember(row) {
      const { error } = await admin.from("workspace_members").upsert(
        { ...row, joined_at: new Date().toISOString() },
        { onConflict: "workspace_id,user_id" },
      );
      if (error) {
        console.error("[redeem-profileless] member upsert:", error);
        return error.message;
      }
      return null;
    },
    async markAccepted(inviteId, userId) {
      const { data, error } = await admin
        .from("account_invitations")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: userId,
        })
        .eq("id", inviteId)
        .is("accepted_at", null)
        .select("id");
      if (error) {
        console.error("[redeem-profileless] mark accepted:", error);
        return { accepted: false, error: "Failed to redeem invitation" };
      }
      return { accepted: Array.isArray(data) && data.length > 0, error: null };
    },
    async rollbackAttach(userId, workspaceId) {
      const member = await admin
        .from("workspace_members")
        .delete()
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId);
      if (member.error) {
        console.error("[redeem-profileless] rollback member:", member.error);
      }
      const profile = await admin.from("profiles").delete().eq("user_id", userId);
      if (profile.error) {
        console.error("[redeem-profileless] rollback profile:", profile.error);
      }
    },
  };
}

export function redeemProfilelessInviteForUser(input: {
  tokenHash: string;
  userId: string;
  email: string;
  fullName: string;
}): Promise<RedeemProfilelessResult> {
  return redeemProfilelessInvite(profilelessInviteDb(supabaseAdmin()), input);
}
