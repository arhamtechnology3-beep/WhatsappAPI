import { authorizeCron } from '@/lib/cron/auth'
import { runFlowsCron } from '@/lib/flows/cron'

/**
 * Sweep abandoned active flow runs.
 *
 * Reads each active run's parent-flow `fallback_policy.on_timeout_hours`
 * to compute the staleness cutoff (default 24h), then marks any run
 * past its cutoff as `timed_out`. Writes a matching `flow_run_events`
 * row for the audit trail.
 *
 * Without this sweep, a customer who abandons a flow mid-conversation
 * keeps a row in `idx_one_active_run_per_contact` (the partial unique
 * index on `flow_runs WHERE status='active'`) forever — blocking any
 * new triggers for them. The cron is therefore not optional.
 *
 * Auth: re-uses `AUTOMATION_CRON_SECRET` so operators only have one
 * secret to provision. The two endpoints (`/api/automations/cron`
 * and this one) are independent operations; we keep them on separate
 * URLs so one failing doesn't block the other.
 *
 * Hosting: the Node process ticks this in-process every minute, and
 * Hostinger / Vercel Cron / GitHub Actions can hit GET /api/cron/tick.
 * A 5-minute interval is more than enough for a 24h timeout default.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied
  return runFlowsCron()
}
