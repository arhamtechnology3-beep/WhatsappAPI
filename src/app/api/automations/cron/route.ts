import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { resumePendingExecution, runAutomationsForTrigger } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'
import { authorizeCron } from '@/lib/cron/auth'
import { cronMatchesNow } from '@/lib/cron/schedule'

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

export async function runAutomationsCron() {
  const admin = supabaseAdmin()
  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let processed = 0
  for (const row of due || []) {
    const { data: claim } = await admin
      .from('automation_pending_executions')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claim) continue

    await resumePendingExecution({
      id: row.id as string,
      automation_id: row.automation_id as string,
      // account_id is NOT NULL on automation_pending_executions
      // post-017; the engine uses it for tenant-scoped lookups.
      account_id: row.account_id as string,
      user_id: row.user_id as string,
      contact_id: (row.contact_id as string | null) ?? null,
      log_id: (row.log_id as string | null) ?? null,
      parent_step_id: (row.parent_step_id as string | null) ?? null,
      branch: (row.branch as 'yes' | 'no' | null) ?? null,
      next_step_position: row.next_step_position as number,
      context: (row.context as AutomationContext) ?? {},
    })
    processed++
  }

  let timeBasedFired = 0
  const { data: scheduled } = await admin
    .from('automations')
    .select('id, account_id, trigger_config, last_executed_at')
    .eq('trigger_type', 'time_based')
    .eq('is_active', true)

  const now = new Date()
  const dueByAccount = new Map<string, string[]>()
  for (const automation of scheduled || []) {
    const schedule = (automation.trigger_config as { schedule?: string } | null)?.schedule
    if (!schedule || !cronMatchesNow(schedule, now)) continue
    const last = automation.last_executed_at ? new Date(automation.last_executed_at).getTime() : 0
    if (last && now.getTime() - last < 45_000) continue
    const ids = dueByAccount.get(automation.account_id) || []
    ids.push(automation.id)
    dueByAccount.set(automation.account_id, ids)
  }

  for (const [accountId, automationIds] of dueByAccount) {
    const { data: contacts } = await admin
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .or('marketing_opt_in.eq.true,whatsapp_marketing_opt_in.eq.true')
      .limit(50)

    for (const contact of contacts || []) {
      await runAutomationsForTrigger({
        accountId,
        triggerType: 'time_based',
        contactId: contact.id,
        context: {},
      })
      timeBasedFired++
    }

    await admin
      .from('automations')
      .update({ last_executed_at: now.toISOString() })
      .in('id', automationIds)
  }

  return NextResponse.json({ processed, timeBasedFired })
}
