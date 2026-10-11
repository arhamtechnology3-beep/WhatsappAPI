import {
  paidFeaturesUnlocked,
  type SubscriptionStatus,
} from "./subscription-state";

export const TRIAL_DAYS = 7;

export interface ShopTrialHistory {
  shopDomain: string;
  shopifyShopId: string | null;
  firstTrialStartedAt: Date;
  firstTrialEndedAt: Date;
}

export interface InstallSubscriptionResolution {
  status: SubscriptionStatus;
  trialStart: Date | null;
  trialEnd: Date | null;
  trialReused: boolean;
  shouldRecordHistory: boolean;
}

function addUtcDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isTrialWindowOpen(
  trialEnd: Date | null | undefined,
  now: Date,
): boolean {
  if (!trialEnd) return false;
  return now.getTime() <= trialEnd.getTime();
}

/**
 * Decide subscription state after a successful install.
 * Never starts a second trial for a shop that already used one.
 */
export function resolveInstallSubscription(opts: {
  history: ShopTrialHistory | null;
  now: Date;
  paidActive?: boolean;
}): InstallSubscriptionResolution {
  if (opts.paidActive) {
    return {
      status: "ACTIVE",
      trialStart: opts.history?.firstTrialStartedAt ?? null,
      trialEnd: opts.history?.firstTrialEndedAt ?? null,
      trialReused: Boolean(opts.history),
      shouldRecordHistory: false,
    };
  }

  if (!opts.history) {
    const trialStart = opts.now;
    const trialEnd = addUtcDays(opts.now, TRIAL_DAYS);
    return {
      status: "TRIALING",
      trialStart,
      trialEnd,
      trialReused: false,
      shouldRecordHistory: true,
    };
  }

  if (isTrialWindowOpen(opts.history.firstTrialEndedAt, opts.now)) {
    return {
      status: "TRIALING",
      trialStart: opts.history.firstTrialStartedAt,
      trialEnd: opts.history.firstTrialEndedAt,
      trialReused: true,
      shouldRecordHistory: false,
    };
  }

  return {
    status: "EXPIRED",
    trialStart: opts.history.firstTrialStartedAt,
    trialEnd: opts.history.firstTrialEndedAt,
    trialReused: true,
    shouldRecordHistory: false,
  };
}

export function effectiveSubscriptionStatus(opts: {
  status: SubscriptionStatus;
  trialEnd?: Date | null;
  now: Date;
}): SubscriptionStatus {
  if (
    opts.status === "TRIALING" &&
    !isTrialWindowOpen(opts.trialEnd ?? null, opts.now)
  ) {
    return "EXPIRED";
  }
  return opts.status;
}

export function entitlementsUnlocked(opts: {
  status: SubscriptionStatus;
  trialEnd?: Date | null;
  now: Date;
}): boolean {
  const status = effectiveSubscriptionStatus(opts);
  return paidFeaturesUnlocked(status);
}
