import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/whatsapp/encryption";
import { resolveInstallSubscription } from "@/lib/billing/trial";
import { transitionSubscription } from "@/lib/billing/subscription-state";
import { writeAuditLog } from "@/lib/audit/log";
import { normalizeShopDomain } from "./store-credentials";

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
 * Idempotent install/reinstall: upsert store + encrypted connection +
 * subscription without resetting trial history.
 */
export async function upsertInstalledStore(
  supabase: SupabaseClient,
  opts: UpsertInstalledStoreOpts,
): Promise<{ storeId: string; subscriptionStatus: string }> {
  const shopDomain = normalizeShopDomain(opts.shopDomain);
  const now = new Date();

  let { data: store } = await supabase
    .from("stores")
    .select("id, organization_id, status")
    .eq("organization_id", opts.organizationId)
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (!store) {
    const { data: byDomain } = await supabase
      .from("stores")
      .select("id, organization_id, status")
      .eq("shop_domain", shopDomain)
      .maybeSingle();
    store = byDomain;
  }

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
      .select("id, organization_id, status")
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

  // Trial history lookup (never reset)
  const { data: historyRow } = await supabase
    .from("shop_trial_history")
    .select(
      "shop_domain, shopify_shop_id, first_trial_started_at, first_trial_ended_at",
    )
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  const resolution = resolveInstallSubscription({
    now,
    history: historyRow
      ? {
          shopDomain: historyRow.shop_domain,
          shopifyShopId: historyRow.shopify_shop_id,
          firstTrialStartedAt: new Date(historyRow.first_trial_started_at),
          firstTrialEndedAt: new Date(historyRow.first_trial_ended_at),
        }
      : null,
  });

  if (resolution.shouldRecordHistory && resolution.trialStart && resolution.trialEnd) {
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

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("store_id", store.id)
    .maybeSingle();

  let fromStatus = existingSub?.status ?? "PENDING_INSTALL";
  let toStatus = resolution.status;

  // Reinstall path: UNINSTALLED → PENDING_INSTALL → apply install resolution
  if (fromStatus === "UNINSTALLED") {
    try {
      fromStatus = transitionSubscription("UNINSTALLED", "REINSTALLED");
    } catch {
      fromStatus = "PENDING_INSTALL";
    }
  }

  await supabase.from("subscriptions").upsert(
    {
      store_id: store.id,
      organization_id: opts.organizationId,
      plan_id: "growth",
      status: toStatus,
      trial_start: resolution.trialStart?.toISOString() ?? null,
      trial_end: resolution.trialEnd?.toISOString() ?? null,
      updated_at: now.toISOString(),
    },
    { onConflict: "store_id" },
  );

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("store_id", store.id)
    .maybeSingle();

  if (sub?.id) {
    await supabase.from("subscription_events").insert({
      subscription_id: sub.id,
      store_id: store.id,
      organization_id: opts.organizationId,
      from_status: existingSub?.status ?? null,
      to_status: toStatus,
      event: resolution.trialReused ? "REINSTALLED" : "INSTALL_SUCCEEDED",
      actor_user_id: opts.actorUserId ?? null,
      metadata: { shopDomain, trialReused: resolution.trialReused },
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
    // Legacy: suspend workspace by domain
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

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("store_id", store.id)
    .maybeSingle();

  if (sub) {
    await supabase
      .from("subscriptions")
      .update({ status: "UNINSTALLED", updated_at: now })
      .eq("id", sub.id);

    await supabase.from("subscription_events").insert({
      subscription_id: sub.id,
      store_id: store.id,
      organization_id: store.organization_id,
      from_status: sub.status,
      to_status: "UNINSTALLED",
      event: "UNINSTALLED",
      metadata: { shopDomain },
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
