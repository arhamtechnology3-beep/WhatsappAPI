import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchShopifyGraphql,
  type ShopifyClientCredentials,
} from "@/lib/shopify/shopify-client";

export interface BillingPlanOffer {
  planId: string;
  displayName: string;
  monthlyPrice: number;
  currency: string;
  shopifyPlanHandle: string | null;
  trialDays: number;
}

export interface CreateSubscriptionResult {
  confirmationUrl: string | null;
  shopifySubscriptionId: string | null;
}

const APP_SUBSCRIPTION_CREATE = /* GraphQL */ `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $lineItems: [AppSubscriptionLineItemInput!]!
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      lineItems: $lineItems
      test: $test
    ) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

/**
 * Billing provider interface — Shopify App Billing is the default.
 * Custom providers (e.g. INR) must be isolated behind this contract.
 */
export interface BillingProvider {
  createSubscription(opts: {
    credentials: ShopifyClientCredentials;
    plan: BillingPlanOffer;
    returnUrl: string;
    test?: boolean;
  }): Promise<CreateSubscriptionResult>;
}

export const shopifyAppBillingProvider: BillingProvider = {
  async createSubscription(opts) {
    const amount = (opts.plan.monthlyPrice / 100).toFixed(2);
    const data = await fetchShopifyGraphql(
      APP_SUBSCRIPTION_CREATE,
      {
        name: opts.plan.displayName,
        returnUrl: opts.returnUrl,
        trialDays: opts.plan.trialDays > 0 ? opts.plan.trialDays : null,
        test: opts.test ?? process.env.SHOPIFY_BILLING_TEST === "true",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount, currencyCode: opts.plan.currency || "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
      opts.credentials,
    );

    const payload = data?.appSubscriptionCreate;
    const errors = payload?.userErrors as
      | Array<{ message?: string }>
      | undefined;
    if (errors && errors.length > 0) {
      throw new Error(
        errors.map((e) => e.message).filter(Boolean).join("; ") ||
          "Shopify billing error",
      );
    }

    return {
      confirmationUrl: payload?.confirmationUrl ?? null,
      shopifySubscriptionId: payload?.appSubscription?.id ?? null,
    };
  },
};

export async function loadPlanOffer(
  supabase: SupabaseClient,
  planId: string,
): Promise<BillingPlanOffer | null> {
  const { data } = await supabase
    .from("plans")
    .select(
      "plan_id, display_name, monthly_price, currency, shopify_plan_handle, trial_days",
    )
    .eq("plan_id", planId)
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  return {
    planId: data.plan_id,
    displayName: data.display_name,
    monthlyPrice: data.monthly_price,
    currency: data.currency,
    shopifyPlanHandle: data.shopify_plan_handle,
    trialDays: data.trial_days,
  };
}

export async function activateVerifiedSubscription(
  supabase: SupabaseClient,
  opts: {
    storeId: string;
    organizationId: string;
    planId: string;
    shopifySubscriptionId: string | null;
    ownerUserId: string;
  },
): Promise<void> {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, status, owner_user_id")
    .eq("owner_user_id", opts.ownerUserId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("subscriptions")
      .update({
        store_id: opts.storeId,
        organization_id: opts.organizationId,
        plan_id: opts.planId,
        status: "ACTIVE",
        shopify_subscription_id: opts.shopifySubscriptionId,
        updated_at: now,
      })
      .eq("id", existing.id);

    await supabase
      .from("workspaces")
      .update({ subscription_id: existing.id })
      .eq("id", opts.organizationId);

    await supabase.from("subscription_events").insert({
      subscription_id: existing.id,
      store_id: opts.storeId,
      organization_id: opts.organizationId,
      from_status: existing.status ?? null,
      to_status: "ACTIVE",
      event: "SUBSCRIPTION_APPROVED",
      actor_user_id: opts.ownerUserId,
      metadata: { shopifySubscriptionId: opts.shopifySubscriptionId },
    });
    return;
  }

  const { data: created, error } = await supabase
    .from("subscriptions")
    .insert({
      owner_user_id: opts.ownerUserId,
      store_id: opts.storeId,
      organization_id: opts.organizationId,
      plan_id: opts.planId,
      status: "ACTIVE",
      shopify_subscription_id: opts.shopifySubscriptionId,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Failed to activate subscription");
  }

  await supabase
    .from("workspaces")
    .update({ subscription_id: created.id })
    .eq("id", opts.organizationId);

  await supabase.from("subscription_events").insert({
    subscription_id: created.id,
    store_id: opts.storeId,
    organization_id: opts.organizationId,
    from_status: null,
    to_status: "ACTIVE",
    event: "SUBSCRIPTION_APPROVED",
    actor_user_id: opts.ownerUserId,
    metadata: { shopifySubscriptionId: opts.shopifySubscriptionId },
  });
}
