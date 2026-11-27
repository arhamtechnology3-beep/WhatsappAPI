import type { SupabaseClient } from "@supabase/supabase-js";

/** Tracking/campaign rows — short window to protect Free-plan egress. */
const DEFAULT_EVENT_RETENTION_DAYS = 14;
/** Shopify webhook audit rows — debug only. */
const WEBHOOK_LOG_RETENTION_DAYS = 7;
/** Visitor session summaries — unused when tracking is off. */
const VISITOR_SESSION_RETENTION_DAYS = 14;

/**
 * Delete aged tracking / campaign / webhook-log rows.
 * Avoid `.select("id")` on deletes — returning every deleted id burned egress.
 */
export async function runDataRetention(
  supabase: SupabaseClient,
  opts?: { retentionDays?: number; now?: Date },
): Promise<{
  deletedEvents: number;
  deletedCampaignEvents: number;
  deletedTokens: number;
  deletedUnlocks: number;
  deletedWebhookLogs: number;
  deletedVisitorSessions: number;
}> {
  const days = opts?.retentionDays ?? DEFAULT_EVENT_RETENTION_DAYS;
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();
  const webhookCutoff = new Date(
    now.getTime() - WEBHOOK_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sessionCutoff = new Date(
    now.getTime() - VISITOR_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: e1, count: deletedEventsCount } = await supabase
    .from("tracking_events")
    .delete({ count: "exact" })
    .lt("occurred_at", cutoff);

  const { error: e2, count: deletedCampaignCount } = await supabase
    .from("campaign_events")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  const { error: e3, count: deletedTokensCount } = await supabase
    .from("contact_link_tokens")
    .delete({ count: "exact" })
    .lt("expires_at", nowIso);

  const { error: e4, count: deletedUnlocksCount } = await supabase
    .from("wa_unlock_requests")
    .delete({ count: "exact" })
    .lt("expires_at", nowIso);

  const { error: e5, count: deletedWebhookCount } = await supabase
    .from("shopify_webhook_logs")
    .delete({ count: "exact" })
    .lt("created_at", webhookCutoff);

  const { error: e6, count: deletedSessionsCount } = await supabase
    .from("visitor_sessions")
    .delete({ count: "exact" })
    .lt("updated_at", sessionCutoff);

  if (e1) console.error("[retention] tracking_events", e1.message);
  if (e2) console.error("[retention] campaign_events", e2.message);
  if (e3) console.error("[retention] contact_link_tokens", e3.message);
  if (e4) console.error("[retention] wa_unlock_requests", e4.message);
  if (e5) console.error("[retention] shopify_webhook_logs", e5.message);
  if (e6) console.error("[retention] visitor_sessions", e6.message);

  const deletedEvents = deletedEventsCount ?? 0;
  const deletedCampaignEvents = deletedCampaignCount ?? 0;
  const deletedTokens = deletedTokensCount ?? 0;
  const deletedUnlocks = deletedUnlocksCount ?? 0;
  const deletedWebhookLogs = deletedWebhookCount ?? 0;
  const deletedVisitorSessions = deletedSessionsCount ?? 0;

  await supabase.from("retention_runs").insert({
    deleted_events: deletedEvents + deletedCampaignEvents,
    deleted_visitors: deletedVisitorSessions,
    metadata: {
      cutoff,
      days,
      deletedCampaignEvents,
      deletedTokens,
      deletedUnlocks,
      deletedWebhookLogs,
      deletedVisitorSessions,
      webhookCutoff,
      sessionCutoff,
    },
  });

  return {
    deletedEvents,
    deletedCampaignEvents,
    deletedTokens,
    deletedUnlocks,
    deletedWebhookLogs,
    deletedVisitorSessions,
  };
}

/**
 * Expire TRIALING subscriptions past trial_end.
 */
export async function reconcileTrialExpiry(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<number> {
  const { data: rows } = await supabase
    .from("subscriptions")
    .select("id, store_id, organization_id, status, trial_end")
    .eq("status", "TRIALING")
    .lt("trial_end", now.toISOString());

  let n = 0;
  for (const row of rows ?? []) {
    await supabase
      .from("subscriptions")
      .update({ status: "EXPIRED", updated_at: now.toISOString() })
      .eq("id", row.id);
    await supabase.from("subscription_events").insert({
      subscription_id: row.id,
      store_id: row.store_id,
      organization_id: row.organization_id,
      from_status: "TRIALING",
      to_status: "EXPIRED",
      event: "TRIAL_EXPIRED",
      metadata: {},
    });
    n++;
  }
  return n;
}

export function isSupportGrantActive(opts: {
  expiresAt: Date;
  revokedAt: Date | null;
  now: Date;
}): boolean {
  if (opts.revokedAt) return false;
  return opts.now.getTime() < opts.expiresAt.getTime();
}
