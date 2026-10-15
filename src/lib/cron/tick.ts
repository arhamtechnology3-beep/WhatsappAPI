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
  jobs: Record<JobName, { status: number; body: unknown }>
}

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

/**
 * Run every delayed-job worker once. Sequential so Hostinger's Node
 * process does not pile Meta/Shopify bursts on the same tick.
 */
export async function runAllCronJobs(): Promise<CronTickResult> {
  const jobs: CronTickResult['jobs'] = {
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

  const runners: Array<[JobName, () => Promise<Response>]> = [
    ['shopify', runShopifyAbandonedCron],
    ['sequences', runShopifySequenceCron],
    ['automations', runAutomationsCron],
    ['flows', runFlowsCron],
    ['identityflow', runIdentityFlowCron],
    ['shipments', runShipmentSweep],
    ['templates', runTemplateStatusSync],
    ['followups', runOrderFollowupsCron],
    ['visitors', runVisitorRecoveryCron],
  ]

  for (const [name, fn] of runners) {
    const result = await runJob(name, fn)
    jobs[name] = { status: result.status, body: result.body }
  }

  const ok = Object.values(jobs).every((job) => job.status >= 200 && job.status < 300)
  return { ok, jobs }
}
