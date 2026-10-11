import { authorizeCron } from '@/lib/cron/auth'
import { runAutomationsCron } from '@/lib/automations/cron'

/**
 * Drain due `automation_pending_executions` rows. Meant to be hit
 * on a schedule (in-process ticker on Hostinger, Vercel Cron, or
 * GET /api/cron/tick) — requires a shared secret via
 * `x-cron-secret` / Bearer / `?secret=` matching
 * `AUTOMATION_CRON_SECRET`.
 *
 * The claim step (status = 'running') serves as a simple lock so
 * overlapping invocations don't double-process rows. Best-effort
 * only; expensive SELECT ... FOR UPDATE is avoided in favor of a
 * two-step UPDATE-by-id.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied
  return runAutomationsCron()
}
