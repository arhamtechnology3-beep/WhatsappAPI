import type { SupabaseClient } from "@supabase/supabase-js";
import { TRIAL_DAYS } from "./trial";
import {
  paidFeaturesUnlocked,
  type SubscriptionStatus,
} from "./subscription-state";
import { SUBSCRIPTION_STATUSES } from "./subscription-state";

export interface OwnerSubscriptionRow {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  storeId: string | null;
  planId: string;
  status: SubscriptionStatus;
  trialStart: Date | null;
  trialEnd: Date | null;
  maxOrganizations: number;
}

export class OrganizationCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationCapError";
  }
}

export class SubscriptionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

function addUtcDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

function mapRow(
  row: {
    id: string;
    owner_user_id: string | null;
    organization_id: string | null;
    store_id: string | null;
    plan_id: string;
    status: string;
    trial_start: string | null;
    trial_end: string | null;
  },
  maxOrganizations: number,
): OwnerSubscriptionRow | null {
  if (!row.owner_user_id || !isSubscriptionStatus(row.status)) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    planId: row.plan_id,
    status: row.status,
    trialStart: row.trial_start ? new Date(row.trial_start) : null,
    trialEnd: row.trial_end ? new Date(row.trial_end) : null,
    maxOrganizations,
  };
}

async function loadMaxOrganizations(
  supabase: SupabaseClient,
  planId: string,
): Promise<number> {
  const { data } = await supabase
    .from("plans")
    .select("max_organizations, usage_limits")
    .eq("plan_id", planId)
    .maybeSingle();

  if (typeof data?.max_organizations === "number" && data.max_organizations > 0) {
    return data.max_organizations;
  }
  const limits = data?.usage_limits as Record<string, unknown> | null;
  if (typeof limits?.maxOrganizations === "number" && limits.maxOrganizations > 0) {
    return limits.maxOrganizations;
  }
  return 1;
}

/**
 * Load the login's current subscription (one row per owner_user_id).
 */
export async function getOwnerSubscription(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<OwnerSubscriptionRow | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "id, owner_user_id, organization_id, store_id, plan_id, status, trial_start, trial_end",
    )
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (!data) return null;
  const maxOrganizations = await loadMaxOrganizations(supabase, data.plan_id);
  return mapRow(data, maxOrganizations);
}

/**
 * Resolve subscription for an organization via workspaces.subscription_id,
 * falling back to the owner's login subscription.
 */
export async function getSubscriptionForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OwnerSubscriptionRow | null> {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("subscription_id")
    .eq("id", organizationId)
    .maybeSingle();

  if (workspace?.subscription_id) {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "id, owner_user_id, organization_id, store_id, plan_id, status, trial_start, trial_end",
      )
      .eq("id", workspace.subscription_id)
      .maybeSingle();
    if (data) {
      const maxOrganizations = await loadMaxOrganizations(supabase, data.plan_id);
      return mapRow(data, maxOrganizations);
    }
  }

  const { data: owner } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!owner?.user_id) return null;
  return getOwnerSubscription(supabase, owner.user_id);
}

export async function countOwnedOrganizations(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<number> {
  const { count } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerUserId)
    .eq("role", "owner");
  return count ?? 0;
}

export function organizationCreationAllowed(opts: {
  subscription: OwnerSubscriptionRow | null;
  ownedCount: number;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  const now = opts.now ?? new Date();

  // First organization bootstraps the trial subscription.
  if (!opts.subscription) {
    if (opts.ownedCount === 0) return { ok: true };
    return {
      ok: false,
      reason: "An active trial or paid subscription is required to add another store organization.",
    };
  }

  const status = opts.subscription.status;
  const trialOpen =
    status === "TRIALING" &&
    opts.subscription.trialEnd != null &&
    now.getTime() <= opts.subscription.trialEnd.getTime();
  const unlocked =
    paidFeaturesUnlocked(status) ||
    (status === "TRIALING" && trialOpen);

  if (!unlocked && status !== "TRIALING") {
    return {
      ok: false,
      reason: "An active trial or paid subscription is required to add another store organization.",
    };
  }

  if (status === "TRIALING" && !trialOpen) {
    return {
      ok: false,
      reason: "Your trial has expired. Choose a plan to add another store organization.",
    };
  }

  if (opts.ownedCount >= opts.subscription.maxOrganizations) {
    return {
      ok: false,
      reason: `Your ${opts.subscription.planId} plan allows ${opts.subscription.maxOrganizations} store organization(s). Upgrade to add more.`,
    };
  }

  return { ok: true };
}

/**
 * Ensure the login has a subscription row. Creates a TRIALING growth
 * subscription on first organization when none exists.
 */
export async function ensureOwnerSubscription(
  supabase: SupabaseClient,
  opts: {
    ownerUserId: string;
    organizationId: string;
    planId?: string;
    now?: Date;
  },
): Promise<OwnerSubscriptionRow> {
  const existing = await getOwnerSubscription(supabase, opts.ownerUserId);
  if (existing) {
    await supabase
      .from("workspaces")
      .update({ subscription_id: existing.id })
      .eq("id", opts.organizationId)
      .is("subscription_id", null);
    return existing;
  }

  const now = opts.now ?? new Date();
  const planId = opts.planId ?? "growth";
  const trialStart = now;
  const trialEnd = addUtcDays(now, TRIAL_DAYS);

  const { data: created, error } = await supabase
    .from("subscriptions")
    .insert({
      owner_user_id: opts.ownerUserId,
      organization_id: opts.organizationId,
      store_id: null,
      plan_id: planId,
      status: "TRIALING",
      trial_start: trialStart.toISOString(),
      trial_end: trialEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .select(
      "id, owner_user_id, organization_id, store_id, plan_id, status, trial_start, trial_end",
    )
    .single();

  if (error || !created) {
    // Race: another request created the row
    const raced = await getOwnerSubscription(supabase, opts.ownerUserId);
    if (raced) {
      await supabase
        .from("workspaces")
        .update({ subscription_id: raced.id })
        .eq("id", opts.organizationId);
      return raced;
    }
    throw new Error(error?.message || "Failed to create subscription");
  }

  await supabase
    .from("workspaces")
    .update({ subscription_id: created.id })
    .eq("id", opts.organizationId);

  await supabase.from("subscription_events").insert({
    subscription_id: created.id,
    store_id: null,
    organization_id: opts.organizationId,
    from_status: null,
    to_status: "TRIALING",
    event: "INSTALL_SUCCEEDED",
    actor_user_id: opts.ownerUserId,
    metadata: { bootstrapped: true },
  });

  const maxOrganizations = await loadMaxOrganizations(supabase, planId);
  const mapped = mapRow(created, maxOrganizations);
  if (!mapped) throw new Error("Failed to map subscription");
  return mapped;
}

export async function attachOrganizationToOwnerSubscription(
  supabase: SupabaseClient,
  opts: {
    ownerUserId: string;
    organizationId: string;
    now?: Date;
  },
): Promise<OwnerSubscriptionRow> {
  const ownedCount = await countOwnedOrganizations(supabase, opts.ownerUserId);
  // ownedCount includes the org we just inserted as a member
  const existing = await getOwnerSubscription(supabase, opts.ownerUserId);

  const check = organizationCreationAllowed({
    subscription: existing,
    // For first org, ensureOwnerSubscription handles creation; count may already be 1
    ownedCount: existing ? ownedCount : Math.max(0, ownedCount - 1),
    now: opts.now,
  });

  if (!check.ok) {
    throw new OrganizationCapError(check.reason);
  }

  const sub = await ensureOwnerSubscription(supabase, {
    ownerUserId: opts.ownerUserId,
    organizationId: opts.organizationId,
    now: opts.now,
  });

  await supabase
    .from("workspaces")
    .update({ subscription_id: sub.id })
    .eq("id", opts.organizationId);

  return sub;
}
