import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function signStorefrontPayload(
  storeId: string,
  timestamp: string,
  body: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${storeId}.${timestamp}.${body}`)
    .digest("hex");
}

export function verifyStorefrontSignature(opts: {
  storeId: string;
  timestamp: string;
  body: string;
  signature: string | null;
  secret: string;
  maxSkewMs?: number;
}): boolean {
  if (!opts.signature) return false;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = opts.maxSkewMs ?? 5 * 60 * 1000;
  if (Math.abs(Date.now() - ts) > skew) return false;

  const expected = signStorefrontPayload(
    opts.storeId,
    opts.timestamp,
    opts.body,
    opts.secret,
  );
  try {
    const a = Buffer.from(opts.signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const ALLOWED_EVENTS = new Set([
  "session_started",
  "page_viewed",
  "product_viewed",
  "collection_viewed",
  "search_performed",
  "add_to_cart",
  "cart_updated",
  "checkout_started",
  "purchase_completed",
  "login_started",
  "login_completed",
  "popup_viewed",
  "popup_dismissed",
  "consent_updated",
  "campaign_converted",
]);

export function isAllowedTrackingEvent(name: string): boolean {
  return ALLOWED_EVENTS.has(name);
}

/** Strip keys that look like payment / password fields. */
export function sanitizeEventPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const blocked = /card|cvv|cvc|password|ssn|pan|otp|secret/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (blocked.test(k)) continue;
    if (typeof v === "string" && v.length > 2000) {
      out[k] = v.slice(0, 2000);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function incrementUsageCounter(
  supabase: SupabaseClient,
  opts: { storeId: string; organizationId: string; field: "tracked_events" | "campaign_sends"; by?: number },
): Promise<void> {
  const period = new Date().toISOString().slice(0, 7);
  const by = opts.by ?? 1;
  const { data: existing } = await supabase
    .from("usage_counters")
    .select("id, tracked_events, campaign_sends")
    .eq("store_id", opts.storeId)
    .eq("period_ym", period)
    .maybeSingle();

  if (!existing) {
    await supabase.from("usage_counters").insert({
      store_id: opts.storeId,
      organization_id: opts.organizationId,
      period_ym: period,
      tracked_events: opts.field === "tracked_events" ? by : 0,
      campaign_sends: opts.field === "campaign_sends" ? by : 0,
    });
    return;
  }

  await supabase
    .from("usage_counters")
    .update({
      tracked_events:
        opts.field === "tracked_events"
          ? (existing.tracked_events ?? 0) + by
          : existing.tracked_events,
      campaign_sends:
        opts.field === "campaign_sends"
          ? (existing.campaign_sends ?? 0) + by
          : existing.campaign_sends,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}
