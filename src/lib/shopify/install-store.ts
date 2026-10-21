import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/whatsapp/encryption";
import { resolveInstallSubscription } from "@/lib/billing/trial";
import {
  ensureOwnerSubscription,
  getOwnerSubscription,
  getSubscriptionForOrganization,
} from "@/lib/billing/owner-subscription";
import { writeAuditLog } from "@/lib/audit/log";
import { normalizeShopDomain } from "./store-credentials";

export class StoreInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreInstallError";
  }
}

export interface UpsertInstalledStoreOpts {
  organizationId: string;
  shopDomain: string;
  shopName: string;
  shopifyShopId?: string | null;
  accessToken: string;
  scopes?: string;
  actorUserId?: string | null;
}

/**
 * Idempotent install/reinstall for one Shopify shop per organization.
 * Billing stays on the login subscription — never inserts a second row.
 */
export async function upsertInstalledStore(
  supabase: SupabaseClient,
  opts: UpsertInstalledStoreOpts,
): Promise<{ storeId: string; subscriptionStatus: string }> {
  const shopDomain = normalizeShopDomain(opts.shopDomain);
  const now = new Date();

  // Refuse if this domain already belongs to another organization.
  const { data: existingByDomain } = await supabase
    .from("stores")
    .select("id, organization_id, shop_domain, status")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (
    existingByDomain &&
    existingByDomain.organization_id !== opts.organizationId
  ) {
    throw new StoreInstallError(
      "This Shopify store is already connected to another organization. Switch to that organization or contact support.",
    );
  }

  // One shop per organization — refuse a second domain.
  const { data: orgStore } = await supabase
    .from("stores")
    .select("id, organization_id, shop_domain, status")
    .eq("organization_id", opts.organizationId)
    .maybeSingle();

  if (
    orgStore &&
    orgStore.shop_domain &&
    normalizeShopDomain(orgStore.shop_domain) !== shopDomain
  ) {
    throw new StoreInstallError(
      "This organization already has a Shopify store. Create another organization from the workspace switcher to connect a second store.",
    );
  }

  let store = existingByDomain ?? orgStore ?? null;

  if (!store) {
    const { data: created, error } = await supabase
      .from("stores")
      .insert({
        organization_id: opts.organizationId,
        name: opts.shopName,
        shop_domain: shopDomain,
        shopify_shop_id: opts.shopifyShopId ?? null,
        status: "active",
      })
      .select("id, organization_id, shop_domain, status")
      .single();
    if (error || !created) {
      throw new Error(error?.message || "Failed to create store");
    }
    store = created;

    if (opts.actorUserId) {
      await supabase.from("store_members").upsert(
        {
          store_id: store.id,
          organization_id: opts.organizationId,
          user_id: opts.actorUserId,
          role: "owner",
        },
        { onConflict: "store_id,user_id", ignoreDuplicates: true },
      );
    }
  } else {
    await supabase
      .from("stores")
      .update({
        name: opts.shopName,
        shop_domain: shopDomain,
        shopify_shop_id: opts.shopifyShopId ?? null,
        status: "active",
        updated_at: now.toISOString(),
      })
      .eq("id", store.id);
  }

  const encrypted = encrypt(opts.accessToken);
  await supabase.from("shopify_connections").upsert(
    {
      store_id: store.id,
      organization_id: opts.organizationId,
      shop_domain: shopDomain,
      shopify_shop_id: opts.shopifyShopId ?? null,
      encrypted_access_token: encrypted,
      scopes: opts.scopes ?? null,
      installed_at: now.toISOString(),
      uninstalled_at: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "store_id" },
  );

  // Resolve the login subscription (do not create a per-store row).
  let ownerSub =
    (opts.actorUserId
      ? await getOwnerSubscription(supabase, opts.actorUserId)
      : null) ??
    (await getSubscriptionForOrganization(supabase, opts.organizationId));

  if (!ownerSub && opts.actorUserId) {
    ownerSub = await ensureOwnerSubscription(supabase, {
      ownerUserId: opts.actorUserId,
      organizationId: opts.organizationId,
      now,
    });
  }

  const { data: historyRow } = await supabase
    .from("shop_trial_history")
    .select(
      "shop_domain, shopify_shop_id, first_trial_started_at, first_trial_ended_at",
    )
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  const paidActive = ownerSub?.status === "ACTIVE";
  const resolution = resolveInstallSubscription({
    now,
    paidActive,
    history: historyRow
      ? {
          shopDomain: historyRow.shop_domain,
          shopifyShopId: historyRow.shopify_shop_id,
          firstTrialStartedAt: new Date(historyRow.first_trial_started_at),
          firstTrialEndedAt: new Date(historyRow.first_trial_ended_at),
        }
      : null,
  });

  // If the login already has a subscription, never reset ACTIVE/TRIALING
  // from a reinstall. Only fill trial dates when bootstrapping.
  let toStatus = ownerSub?.status ?? resolution.status;
  if (paidActive) {
    toStatus = "ACTIVE";
  } else if (ownerSub?.status === "TRIALING") {
    toStatus = "TRIALING";
  } else if (!ownerSub) {
    toStatus = resolution.status;
  }

  if (
    resolution.shouldRecordHistory &&
    resolution.trialStart &&
    resolution.trialEnd
  ) {
    const { data: existingHistory } = await supabase
      .from("shop_trial_history")
      .select("id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();
    if (!existingHistory) {
      await supabase.from("shop_trial_history").insert({
        shop_domain: shopDomain,
        shopify_shop_id: opts.shopifyShopId ?? null,
        organization_id: opts.organizationId,
        store_id: store.id,
        first_trial_started_at: resolution.trialStart.toISOString(),
        first_trial_ended_at: resolution.trialEnd.toISOString(),
      });
    }
  }

  if (ownerSub) {
    const fromStatus = ownerSub.status;
    const patch: Record<string, unknown> = {
      organization_id: opts.organizationId,
      store_id: store.id,
      updated_at: now.toISOString(),
    };

    // Only move UNINSTALLED → apply resolution; never demote ACTIVE.
    if (fromStatus === "UNINSTALLED") {
      patch.status = toStatus;
      if (resolution.trialStart) {
        patch.trial_start = resolution.trialStart.toISOString();
      }
      if (resolution.trialEnd) {
        patch.trial_end = resolution.trialEnd.toISOString();
      }
    } else if (
      !ownerSub.trialStart &&
      resolution.trialStart &&
      toStatus === "TRIALING"
    ) {
      patch.trial_start = resolution.trialStart.toISOString();
      patch.trial_end = resolution.trialEnd?.toISOString() ?? null;
      patch.status = toStatus;
    }

    await supabase.from("subscriptions").update(patch).eq("id", ownerSub.id);

    await supabase
      .from("workspaces")
      .update({ subscription_id: ownerSub.id })
      .eq("id", opts.organizationId);

    await supabase.from("subscription_events").insert({
      subscription_id: ownerSub.id,
      store_id: store.id,
      organization_id: opts.organizationId,
      from_status: fromStatus,
      to_status: (patch.status as string) ?? fromStatus,
      event: resolution.trialReused || paidActive ? "REINSTALLED" : "INSTALL_SUCCEEDED",
      actor_user_id: opts.actorUserId ?? null,
      metadata: { shopDomain, trialReused: resolution.trialReused, paidActive },
    });
  }

  await writeAuditLog(supabase, {
    organizationId: opts.organizationId,
    storeId: store.id,
    actorUserId: opts.actorUserId,
    action: "shopify.install",
    resourceType: "store",
    resourceId: store.id,
    metadata: { shopDomain, status: toStatus },
  });

  return { storeId: store.id, subscriptionStatus: toStatus };
}

/**
 * Mark a single shop uninstalled. Does NOT cancel the login subscription
 * — Jason's other organizations keep their plan.
 */
export async function markStoreUninstalled(
  supabase: SupabaseClient,
  shopDomainRaw: string,
): Promise<void> {
  const shopDomain = normalizeShopDomain(shopDomainRaw);
  const now = new Date().toISOString();

  const { data: store } = await supabase
    .from("stores")
    .select("id, organization_id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (!store) {
    await supabase
      .from("workspaces")
      .update({ status: "suspended" })
      .eq("shopify_shop_domain", shopDomain);
    return;
  }

  await supabase
    .from("stores")
    .update({ status: "uninstalled", updated_at: now })
    .eq("id", store.id);

  await supabase
    .from("shopify_connections")
    .update({
      uninstalled_at: now,
      encrypted_access_token: null,
      updated_at: now,
    })
    .eq("store_id", store.id);

  const ownerSub = await getSubscriptionForOrganization(
    supabase,
    store.organization_id,
  );

  if (ownerSub) {
    // Clear billing store pointer if this shop was the charging store.
    if (ownerSub.storeId === store.id) {
      await supabase
        .from("subscriptions")
        .update({ store_id: null, updated_at: now })
        .eq("id", ownerSub.id);
    }

    await supabase.from("subscription_events").insert({
      subscription_id: ownerSub.id,
      store_id: store.id,
      organization_id: store.organization_id,
      from_status: ownerSub.status,
      to_status: ownerSub.status,
      event: "UNINSTALLED",
      metadata: { shopDomain, storeOnly: true },
    });
  }

  await writeAuditLog(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    action: "shopify.uninstall",
    resourceType: "store",
    resourceId: store.id,
    metadata: { shopDomain },
  });
}
