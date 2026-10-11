import { z } from "zod";
import { badRequest, ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { ForbiddenError, getCurrentAccount } from "@/lib/auth/account";
import {
  getStoreEntitlements,
  loadAccessibleStoreForActor,
} from "@/lib/auth/store";
import {
  activateVerifiedSubscription,
  loadPlanOffer,
  shopifyAppBillingProvider,
} from "@/lib/billing/shopify-billing";
import { resolveStoreCredentials } from "@/lib/shopify/store-credentials";
import { writeAuditLog } from "@/lib/audit/log";

const bodySchema = z.object({
  storeId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  planId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount();
    if (account.role !== "owner" && account.role !== "admin") {
      throw new ForbiddenError("Billing requires admin or owner");
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) throw badRequest("storeId and planId are required");

    const accessible = await loadAccessibleStoreForActor(
      account,
      parsed.data.storeId,
    );
    if (!accessible) {
      throw new ForbiddenError("Store is not in this organization");
    }

    const plan = await loadPlanOffer(account.supabase, parsed.data.planId);
    if (!plan) throw badRequest("Unknown or inactive plan");

    const credentials = await resolveStoreCredentials(account.supabase, {
      storeId: accessible.store.id,
    });

    const host =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://whatsapp.arhamtechnology.com";
    const returnUrl = `${host.replace(/\/$/, "")}/api/v1/billing/confirm?storeId=${accessible.store.id}&planId=${encodeURIComponent(plan.planId)}`;

    // Env-token / custom-app installs may lack App Billing scopes — activate locally.
    if (credentials.source === "env" || process.env.SHOPIFY_BILLING_MOCK === "true") {
      await activateVerifiedSubscription(account.supabase, {
        storeId: accessible.store.id,
        organizationId: account.accountId,
        planId: plan.planId,
        shopifySubscriptionId: `mock_${plan.planId}_${Date.now()}`,
      });
      const entitlements = await getStoreEntitlements(
        accessible.store.id,
        account,
      );
      await writeAuditLog(account.supabase, {
        organizationId: account.accountId,
        storeId: accessible.store.id,
        actorUserId: account.userId,
        action: "billing.activate_mock",
        resourceType: "subscription",
        resourceId: accessible.store.id,
        metadata: { planId: plan.planId },
      });
      return ok({ mode: "mock", entitlements, confirmationUrl: null });
    }

    const result = await shopifyAppBillingProvider.createSubscription({
      credentials,
      plan,
      returnUrl,
    });

    if (result.shopifySubscriptionId) {
      await account.supabase
        .from("subscriptions")
        .update({
          shopify_subscription_id: result.shopifySubscriptionId,
          plan_id: plan.planId,
          updated_at: new Date().toISOString(),
        })
        .eq("store_id", accessible.store.id);
    }

    await writeAuditLog(account.supabase, {
      organizationId: account.accountId,
      storeId: accessible.store.id,
      actorUserId: account.userId,
      action: "billing.create_subscription",
      resourceType: "subscription",
      resourceId: accessible.store.id,
      metadata: { planId: plan.planId },
    });

    return ok({
      mode: "shopify",
      confirmationUrl: result.confirmationUrl,
      shopifySubscriptionId: result.shopifySubscriptionId,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function GET() {
  try {
    const account = await getCurrentAccount();
    const { data: plans } = await account.supabase
      .from("plans")
      .select(
        "plan_id, display_name, currency, monthly_price, annual_price, trial_days, feature_entitlements, usage_limits",
      )
      .eq("active", true)
      .order("monthly_price", { ascending: true });

    return ok({ plans: plans ?? [] });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
