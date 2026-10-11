export const SUBSCRIPTION_STATUSES = [
  "PENDING_INSTALL",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
  "UNINSTALLED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_EVENTS = [
  "INSTALL_SUCCEEDED",
  "TRIAL_EXPIRED",
  "SUBSCRIPTION_APPROVED",
  "PAYMENT_FAILED",
  "PAYMENT_RECOVERED",
  "CANCELLED",
  "REACTIVATED",
  "UNINSTALLED",
  "REINSTALLED",
] as const;

export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

const TRANSITIONS: Record<SubscriptionEvent, Partial<Record<SubscriptionStatus, SubscriptionStatus>>> =
  {
    INSTALL_SUCCEEDED: {
      PENDING_INSTALL: "TRIALING",
    },
    TRIAL_EXPIRED: {
      TRIALING: "EXPIRED",
    },
    SUBSCRIPTION_APPROVED: {
      PENDING_INSTALL: "ACTIVE",
      TRIALING: "ACTIVE",
      PAST_DUE: "ACTIVE",
      CANCELLED: "ACTIVE",
      EXPIRED: "ACTIVE",
      SUSPENDED: "ACTIVE",
    },
    PAYMENT_FAILED: {
      ACTIVE: "PAST_DUE",
      TRIALING: "PAST_DUE",
    },
    PAYMENT_RECOVERED: {
      PAST_DUE: "ACTIVE",
    },
    CANCELLED: {
      TRIALING: "CANCELLED",
      ACTIVE: "CANCELLED",
      PAST_DUE: "CANCELLED",
    },
    REACTIVATED: {
      CANCELLED: "ACTIVE",
      EXPIRED: "ACTIVE",
      SUSPENDED: "ACTIVE",
    },
    UNINSTALLED: {
      PENDING_INSTALL: "UNINSTALLED",
      TRIALING: "UNINSTALLED",
      ACTIVE: "UNINSTALLED",
      PAST_DUE: "UNINSTALLED",
      CANCELLED: "UNINSTALLED",
      EXPIRED: "UNINSTALLED",
      SUSPENDED: "UNINSTALLED",
    },
    REINSTALLED: {
      UNINSTALLED: "PENDING_INSTALL",
    },
  };

export class IllegalSubscriptionTransitionError extends Error {
  constructor(
    readonly from: SubscriptionStatus,
    readonly event: SubscriptionEvent,
  ) {
    super(`Illegal subscription transition: ${from} + ${event}`);
    this.name = "IllegalSubscriptionTransitionError";
  }
}

export function transitionSubscription(
  from: SubscriptionStatus,
  event: SubscriptionEvent,
): SubscriptionStatus {
  const next = TRANSITIONS[event][from];
  if (!next) {
    throw new IllegalSubscriptionTransitionError(from, event);
  }
  return next;
}

export function paidFeaturesUnlocked(status: SubscriptionStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE";
}
