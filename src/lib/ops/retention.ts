import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_EVENT_RETENTION_DAYS = 90;

/**
 * Delete aged tracking / campaign events. Idempotent; safe for cron.
 */
export async function runDataRetention(
  supabase: SupabaseClient,
  opts?: { retentionDays?: number; now?: Date },
): Promise<{ deletedEvents: number; deletedCampaignEvents: number }> {
  const days = opts?.retentionDays ?? DEFAULT_EVENT_RETENTION_DAYS;
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error: e1 } = await supabase
    .from("tracking_events")
    .delete()
    .lt("occurred_at", cutoff)
    .select("id");

  const { data: campaignEvents, error: e2 } = await supabase
    .from("campaign_events")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (e1) console.error("[retention] tracking_events", e1.message);
  if (e2) console.error("[retention] campaign_events", e2.message);

  const deletedEvents = events?.length ?? 0;
  const deletedCampaignEvents = campaignEvents?.length ?? 0;

  await supabase.from("retention_runs").insert({
    deleted_events: deletedEvents + deletedCampaignEvents,
    deleted_visitors: 0,
    metadata: { cutoff, days, deletedCampaignEvents },
  });

  return { deletedEvents, deletedCampaignEvents };
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
