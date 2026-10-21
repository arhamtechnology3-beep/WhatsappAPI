import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  incrementUsageCounter,
  isAllowedTrackingEvent,
  sanitizeEventPayload,
  verifyStorefrontSignature,
} from "@/lib/tracking/events";
import { computeStoreEntitlements } from "@/lib/billing/entitlements";
import { getSubscriptionForOrganization } from "@/lib/billing/owner-subscription";
import type { SubscriptionStatus } from "@/lib/billing/subscription-state";
import { SUBSCRIPTION_STATUSES } from "@/lib/billing/subscription-state";

const eventSchema = z.object({
  storeId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  eventId: z.string().min(8).max(128),
  eventName: z.string().min(1).max(64),
  visitorId: z.string().max(128).optional(),
  sessionId: z.string().max(128).optional(),
  consentGranted: z.boolean(),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().optional(),
});

function cors(origin: string | null) {
  const allowed = (process.env.SHOPIFY_STOREFRONT_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-IdentityFlow-Store, X-IdentityFlow-Timestamp, X-IdentityFlow-Signature",
  };
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: cors(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  const rawBody = await request.text();

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400, headers });
  }

  const body = parsed.data;
  if (!isAllowedTrackingEvent(body.eventName)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400, headers });
  }

  // Consent gate — only consent_updated may arrive without consent.
  if (!body.consentGranted && body.eventName !== "consent_updated") {
    return NextResponse.json(
      { error: "Consent required" },
      { status: 403, headers },
    );
  }

  const secret = process.env.STOREFRONT_INGEST_SECRET?.trim();
  if (secret) {
    const ok = verifyStorefrontSignature({
      storeId: body.storeId,
      timestamp: request.headers.get("X-IdentityFlow-Timestamp") || "",
      body: rawBody,
      signature: request.headers.get("X-IdentityFlow-Signature"),
      secret,
    });
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers });
    }
  }

  const supabase = supabaseAdmin();
  const { data: store } = await supabase
    .from("stores")
    .select("id, organization_id, name, shop_domain, shopify_shop_id, status")
    .eq("id", body.storeId)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers });
  }

  const ownerSub = await getSubscriptionForOrganization(
    supabase,
    store.organization_id,
  );

  const { data: plan } = ownerSub?.planId
    ? await supabase
        .from("plans")
        .select("plan_id, feature_entitlements, usage_limits, max_organizations")
        .eq("plan_id", ownerSub.planId)
        .maybeSingle()
    : { data: null };

  const entitlements = computeStoreEntitlements({
    store: {
      id: store.id,
      organizationId: store.organization_id,
      name: store.name,
      shopDomain: store.shop_domain,
      shopifyShopId: store.shopify_shop_id,
      status: store.status,
    },
    actor: {
      userId: "storefront",
      organizationId: store.organization_id,
      orgRole: "owner",
      storeMemberRole: "owner",
    },
    subscription: ownerSub
      ? {
          status: (SUBSCRIPTION_STATUSES as readonly string[]).includes(ownerSub.status)
            ? (ownerSub.status as SubscriptionStatus)
            : "PENDING_INSTALL",
          planId: ownerSub.planId,
          trialEnd: ownerSub.trialEnd,
        }
      : null,
    plan: plan
      ? {
          planId: plan.plan_id,
          featureEntitlements: plan.feature_entitlements,
          usageLimits: {
            ...((plan.usage_limits as Record<string, unknown>) ?? {}),
            maxOrganizations:
              typeof plan.max_organizations === "number"
                ? plan.max_organizations
                : ownerSub?.maxOrganizations ?? 0,
          },
        }
      : null,
  });

  if (!entitlements.features.visitorTracking) {
    return NextResponse.json(
      { error: "Visitor tracking not entitled" },
      { status: 402, headers },
    );
  }

  // Usage limit
  const period = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabase
    .from("usage_counters")
    .select("tracked_events")
    .eq("store_id", store.id)
    .eq("period_ym", period)
    .maybeSingle();

  if (
    (usage?.tracked_events ?? 0) >= entitlements.limits.monthlyTrackedEvents &&
    entitlements.limits.monthlyTrackedEvents > 0
  ) {
    return NextResponse.json({ error: "Monthly event limit reached" }, { status: 429, headers });
  }

  const payload = sanitizeEventPayload(body.payload ?? {});

  const { error } = await supabase.from("tracking_events").upsert(
    {
      store_id: store.id,
      organization_id: store.organization_id,
      event_id: body.eventId,
      event_name: body.eventName,
      visitor_id: body.visitorId ?? null,
      session_id: body.sessionId ?? null,
      consent_granted: body.consentGranted,
      payload,
      occurred_at: body.occurredAt ?? new Date().toISOString(),
    },
    { onConflict: "store_id,event_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[events/ingest]", error.message);
    return NextResponse.json({ error: "Persist failed" }, { status: 500, headers });
  }

  if (body.eventName === "consent_updated") {
    await supabase.from("consent_records").insert({
      store_id: store.id,
      organization_id: store.organization_id,
      subject_type: "visitor",
      subject_id: body.visitorId ?? null,
      purpose: "tracking",
      status: body.consentGranted ? "granted" : "denied",
      source: "storefront_sdk",
      metadata: payload,
    });
  }

  await incrementUsageCounter(supabase, {
    storeId: store.id,
    organizationId: store.organization_id,
    field: "tracked_events",
  });

  return NextResponse.json({ ok: true }, { headers });
}
