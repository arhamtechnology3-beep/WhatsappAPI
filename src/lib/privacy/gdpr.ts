import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { resolveShopifyShopContext } from "@/lib/shopify/shop-context";

function hashPii(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function recordWebhookReceipt(
  supabase: SupabaseClient,
  opts: {
    topic: string;
    shopDomain: string | null;
    webhookId: string | null;
    payload: unknown;
  },
): Promise<{ duplicate: boolean; id: string | null }> {
  if (opts.webhookId) {
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("webhook_id", opts.webhookId)
      .maybeSingle();
    if (existing) return { duplicate: true, id: existing.id };
  }

  let storeId: string | null = null;
  let organizationId: string | null = null;
  if (opts.shopDomain) {
    try {
      const ctx = await resolveShopifyShopContext(supabase, opts.shopDomain);
      storeId = ctx.storeId;
      organizationId = ctx.organizationId;
    } catch {
      // receipt still useful without tenant
    }
  }

  const { data, error } = await supabase
    .from("webhook_events")
    .insert({
      store_id: storeId,
      organization_id: organizationId,
      shop_domain: opts.shopDomain,
      topic: opts.topic,
      webhook_id: opts.webhookId,
      status: "received",
      payload: opts.payload as object,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique race
    if (opts.webhookId) {
      const { data: again } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("webhook_id", opts.webhookId)
        .maybeSingle();
      if (again) return { duplicate: true, id: again.id };
    }
    console.error("[webhook_events] insert failed", error.message);
    return { duplicate: false, id: null };
  }

  return { duplicate: false, id: data?.id ?? null };
}

export async function handleCustomersDataRequest(
  supabase: SupabaseClient,
  opts: {
    shopDomain: string;
    shopifyCustomerId?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ jobId: string; export: Record<string, unknown> }> {
  const ctx = await resolveShopifyShopContext(supabase, opts.shopDomain);
  const emailHash = hashPii(opts.email);
  const phoneHash = hashPii(opts.phone);

  let profileQuery = supabase
    .from("customer_profiles")
    .select("*")
    .eq("organization_id", ctx.organizationId);

  if (ctx.storeId) profileQuery = profileQuery.eq("store_id", ctx.storeId);
  if (opts.shopifyCustomerId) {
    profileQuery = profileQuery.eq("shopify_customer_id", opts.shopifyCustomerId);
  }

  const { data: profiles } = await profileQuery.limit(20);

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phone, email, shopify_customer_id, created_at")
    .eq("account_id", ctx.accountId)
    .or(
      [
        opts.shopifyCustomerId
          ? `shopify_customer_id.eq.${opts.shopifyCustomerId}`
          : null,
        opts.email ? `email.eq.${opts.email}` : null,
        opts.phone ? `phone.eq.${opts.phone}` : null,
      ]
        .filter(Boolean)
        .join(",") || "id.is.null",
    )
    .limit(20);

  const exportPayload = {
    shopDomain: opts.shopDomain,
    profiles: profiles ?? [],
    contacts: (contacts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      // Redact raw PII in stored job result — return hashes only in logs
      email_present: Boolean(c.email),
      phone_present: Boolean(c.phone),
      shopify_customer_id: c.shopify_customer_id,
      created_at: c.created_at,
    })),
    emailHash,
    phoneHash,
    generatedAt: new Date().toISOString(),
  };

  const { data: job } = await supabase
    .from("privacy_jobs")
    .insert({
      store_id: ctx.storeId,
      organization_id: ctx.organizationId,
      shop_domain: opts.shopDomain,
      job_type: "customers_data_request",
      shopify_customer_id: opts.shopifyCustomerId ?? null,
      status: "completed",
      result: exportPayload,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { jobId: job?.id ?? "", export: exportPayload };
}

export async function handleCustomersRedact(
  supabase: SupabaseClient,
  opts: {
    shopDomain: string;
    shopifyCustomerId?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ jobId: string; redacted: number }> {
  const ctx = await resolveShopifyShopContext(supabase, opts.shopDomain);
  let redacted = 0;

  if (ctx.storeId && opts.shopifyCustomerId) {
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("id")
      .eq("store_id", ctx.storeId)
      .eq("shopify_customer_id", opts.shopifyCustomerId);

    for (const p of profiles ?? []) {
      await supabase
        .from("customer_profiles")
        .update({
          email_hash: null,
          phone_hash: null,
          display_name: "[redacted]",
          metadata: {},
          communication_preferences: {},
          consent_status: "withdrawn",
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      redacted++;
    }
  }

  // Soft-redact linked contacts in org (keep row for CRM integrity)
  if (opts.shopifyCustomerId || opts.phone || opts.email) {
    let find = supabase
      .from("contacts")
      .select("id")
      .eq("account_id", ctx.accountId)
      .limit(50);

    if (opts.shopifyCustomerId) {
      find = find.eq("shopify_customer_id", opts.shopifyCustomerId);
    } else if (opts.email) {
      find = find.eq("email", opts.email);
    } else if (opts.phone) {
      find = find.eq("phone", opts.phone);
    }

    const { data: matches } = await find;
    for (const row of matches ?? []) {
      await supabase
        .from("contacts")
        .update({
          name: "[redacted]",
          email: null,
          phone: `redacted-${row.id.slice(0, 8)}`,
        })
        .eq("id", row.id);
      redacted++;
    }
  }

  const { data: job } = await supabase
    .from("privacy_jobs")
    .insert({
      store_id: ctx.storeId,
      organization_id: ctx.organizationId,
      shop_domain: opts.shopDomain,
      job_type: "customers_redact",
      shopify_customer_id: opts.shopifyCustomerId ?? null,
      status: "completed",
      result: { redacted },
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { jobId: job?.id ?? "", redacted };
}

export async function handleShopRedact(
  supabase: SupabaseClient,
  shopDomain: string,
): Promise<{ jobId: string }> {
  const ctx = await resolveShopifyShopContext(supabase, shopDomain);

  if (ctx.storeId) {
    await supabase.from("tracking_events").delete().eq("store_id", ctx.storeId);
    await supabase.from("customer_profiles").delete().eq("store_id", ctx.storeId);
    await supabase.from("campaign_events").delete().eq("store_id", ctx.storeId);
    await supabase.from("visitor_sessions").delete().eq("store_id", ctx.storeId);
    await supabase.from("visitor_identity_map").delete().eq("store_id", ctx.storeId);
  }

  const { data: job } = await supabase
    .from("privacy_jobs")
    .insert({
      store_id: ctx.storeId,
      organization_id: ctx.organizationId,
      shop_domain: shopDomain,
      job_type: "shop_redact",
      status: "completed",
      result: { storeId: ctx.storeId },
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { jobId: job?.id ?? "" };
}
