import { runAutomationsCron } from '@/lib/automations/cron'
import { runFlowsCron } from '@/lib/flows/cron'
import { runShopifyAbandonedCron } from '@/lib/shopify/abandoned-cron'
import { runShopifySequenceCron } from '@/lib/shopify/sequence-cron'
import { reconcileTrialExpiry, runDataRetention } from '@/lib/ops/retention'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sweepOpenShipments } from '@/lib/logistics/shipment-sweep'
import { syncPendingTemplateStatuses } from '@/lib/whatsapp/pending-template-sync'
import { runOrderFollowupsCron } from '@/lib/followups/order-followups'
import { runVisitorRecoveryCron } from '@/lib/visitors/recovery-cron'
import { tryAcquireCronTickLock, releaseCronTickLock } from '@/lib/cron/lock'
import { shouldRunThrottled } from '@/lib/cron/throttle'
import { NextResponse } from 'next/server'

type JobName =
  | 'shopify'
  | 'sequences'
  | 'automations'
  | 'flows'
  | 'identityflow'
  | 'shipments'
  | 'templates'
  | 'followups'
  | 'visitors'

export type CronTickResult = {
  ok: boolean
  skipped?: 'already_running'
  jobs: Record<JobName, { status: number; body: unknown }>
}

/** Retention + trial expiry — once per 6h; DELETE burns CPU/NPROC. */
const IDENTITYFLOW_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Visitor session scans — once per 2h (hPanel cron is also every 2h). */
const VISITORS_INTERVAL_MS = 2 * 60 * 60 * 1000

async function bodyOf(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return { error: `non-json ${res.status}` }
  }
}

async function runJob(name: JobName, fn: () => Promise<Response>) {
  try {
    const res = await fn()
    return { name, status: res.status, body: await bodyOf(res) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron-tick] ${name} failed:`, message)
    return { name, status: 500, body: { error: message } }
  }
}

async function runIdentityFlowCron(): Promise<Response> {
  if (!shouldRunThrottled('identityflow', IDENTITYFLOW_INTERVAL_MS)) {
    return NextResponse.json({ ok: true, skipped: 'throttled' })
  }
  const supabase = supabaseAdmin()
  const expired = await reconcileTrialExpiry(supabase)
  const retention = await runDataRetention(supabase)
  return NextResponse.json({ ok: true, trialsExpired: expired, retention })
}

async function runShipmentSweep(): Promise<Response> {
  const result = await sweepOpenShipments(supabaseAdmin())
  return NextResponse.json({ ok: true, ...result })
}

async function runTemplateStatusSync(): Promise<Response> {
  const result = await syncPendingTemplateStatuses(supabaseAdmin())
  return NextResponse.json({ ok: true, ...result })
}

async function runVisitorsCron(): Promise<Response> {
  if (!shouldRunThrottled('visitors', VISITORS_INTERVAL_MS)) {
    return NextResponse.json({ ok: true, skipped: 'throttled', processed: 0 })
  }
  return runVisitorRecoveryCron()
}

function emptyJobs(): CronTickResult['jobs'] {
  return {
    shopify: { status: 500, body: { error: 'not-run' } },
    sequences: { status: 500, body: { error: 'not-run' } },
    automations: { status: 500, body: { error: 'not-run' } },
    flows: { status: 500, body: { error: 'not-run' } },
    identityflow: { status: 500, body: { error: 'not-run' } },
    shipments: { status: 500, body: { error: 'not-run' } },
    templates: { status: 500, body: { error: 'not-run' } },
    followups: { status: 500, body: { error: 'not-run' } },
    visitors: { status: 500, body: { error: 'not-run' } },
  }
}

/**
 * Run every delayed-job worker once. Sequential so Hostinger's Node
 * process does not pile Meta/Shopify bursts on the same tick.
 *
 * Overlapping invocations (in-process timer + hPanel curl while a prior
 * tick is still draining) return `{ skipped: 'already_running' }` instead
 * of stacking another full pass.
 */
export async function runAllCronJobs(): Promise<CronTickResult> {
  if (!tryAcquireCronTickLock()) {
    return {
      ok: true,
      skipped: 'already_running',
      jobs: emptyJobs(),
    }
  }

  const jobs = emptyJobs()

  try {
    const runners: Array<[JobName, () => Promise<Response>]> = [
      ['shopify', runShopifyAbandonedCron],
      ['sequences', runShopifySequenceCron],
      ['automations', runAutomationsCron],
      ['flows', runFlowsCron],
      ['identityflow', runIdentityFlowCron],
      ['shipments', runShipmentSweep],
      ['templates', runTemplateStatusSync],
      ['followups', runOrderFollowupsCron],
      ['visitors', runVisitorsCron],
    ]

    for (const [name, fn] of runners) {
      const result = await runJob(name, fn)
      jobs[name] = { status: result.status, body: result.body }
    }

    const ok = Object.values(jobs).every((job) => job.status >= 200 && job.status < 300)
    return { ok, jobs }
  } finally {
    releaseCronTickLock()
  }
}
