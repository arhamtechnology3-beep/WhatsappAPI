import type { AccountRole } from "@/lib/auth/roles";
import { canAccessStore, type StoreRecord, type StoreRole } from "@/lib/auth/store-access";
import { effectiveSubscriptionStatus, entitlementsUnlocked } from "./trial";
import type { SubscriptionStatus } from "./subscription-state";

export const LOCKED_FEATURES = {
  visitorTracking: false,
  otpLogin: false,
  passkeys: false,
  campaigns: false,
  advancedSegments: false,
  whatsappAutomation: false,
} as const;

export const ZERO_LIMITS = {
  monthlyTrackedEvents: 0,
  campaigns: 0,
} as const;

export type EntitlementFeatures = {
  visitorTracking: boolean;
  otpLogin: boolean;
  passkeys: boolean;
  campaigns: boolean;
  advancedSegments: boolean;
  whatsappAutomation: boolean;
};

export type EntitlementLimits = {
  monthlyTrackedEvents: number;
  campaigns: number;
};

export interface PlanEntitlements {
  planId: string;
  features: EntitlementFeatures;
  limits: EntitlementLimits;
}

export interface StoreEntitlements {
  storeId: string;
  status: SubscriptionStatus;
  plan: string;
  features: EntitlementFeatures;
  limits: EntitlementLimits;
}

export interface EntitlementActor {
  userId: string;
  organizationId: string;
  orgRole: AccountRole;
  storeMemberRole: StoreRole | null;
}

const EMPTY_FEATURES: EntitlementFeatures = { ...LOCKED_FEATURES };
const EMPTY_LIMITS: EntitlementLimits = { ...ZERO_LIMITS };

function asFeatures(raw: unknown): EntitlementFeatures {
  if (!raw || typeof raw !== "object") return EMPTY_FEATURES;
  const o = raw as Record<string, unknown>;
  return {
    visitorTracking: o.visitorTracking === true,
    otpLogin: o.otpLogin === true,
    passkeys: o.passkeys === true,
    campaigns: o.campaigns === true,
    advancedSegments: o.advancedSegments === true,
    whatsappAutomation: o.whatsappAutomation === true,
  };
}

function asLimits(raw: unknown): EntitlementLimits {
  if (!raw || typeof raw !== "object") return EMPTY_LIMITS;
  const o = raw as Record<string, unknown>;
  return {
    monthlyTrackedEvents:
      typeof o.monthlyTrackedEvents === "number" ? o.monthlyTrackedEvents : 0,
    campaigns: typeof o.campaigns === "number" ? o.campaigns : 0,
  };
}

/**
 * Pure entitlement calculation. Callers must already have verified
 * org membership + store access. Plan name from the client is ignored;
 * pass the plan row loaded server-side.
 */
export function computeStoreEntitlements(opts: {
  store: StoreRecord;
  actor: EntitlementActor;
  subscription: {
    status: SubscriptionStatus;
    planId: string;
    trialEnd?: Date | null;
  } | null;
  plan: {
    planId: string;
    featureEntitlements: unknown;
    usageLimits: unknown;
  } | null;
  now?: Date;
  /** Client-supplied plan name — discarded. */
  claimedPlan?: string;
}): StoreEntitlements {
  void opts.claimedPlan;

  if (
    !canAccessStore({
      actorOrganizationId: opts.actor.organizationId,
      orgRole: opts.actor.orgRole,
      store: opts.store,
      storeMemberRole: opts.actor.storeMemberRole,
    })
  ) {
    return {
      storeId: opts.store.id,
      status: "PENDING_INSTALL",
      plan: "none",
      features: EMPTY_FEATURES,
      limits: EMPTY_LIMITS,
    };
  }

  const now = opts.now ?? new Date();
  const status = effectiveSubscriptionStatus({
    status: opts.subscription?.status ?? "PENDING_INSTALL",
    trialEnd: opts.subscription?.trialEnd ?? null,
    now,
  });
  const unlocked = entitlementsUnlocked({
    status: opts.subscription?.status ?? "PENDING_INSTALL",
    trialEnd: opts.subscription?.trialEnd ?? null,
    now,
  });
  const planId = opts.plan?.planId ?? opts.subscription?.planId ?? "none";
  const features = unlocked ? asFeatures(opts.plan?.featureEntitlements) : EMPTY_FEATURES;
  const limits = unlocked ? asLimits(opts.plan?.usageLimits) : EMPTY_LIMITS;

  return {
    storeId: opts.store.id,
    status,
    plan: planId,
    features,
    limits,
  };
}
