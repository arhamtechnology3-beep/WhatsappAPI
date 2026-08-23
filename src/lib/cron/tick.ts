import { runAutomationsCron } from '@/app/api/automations/cron/route'
import { runFlowsCron } from '@/app/api/flows/cron/route'
import { runShopifyAbandonedCron } from '@/app/api/shopify/cron/route'
import { runShopifySequenceCron } from '@/app/api/shopify/cron/sequences/route'

type JobName = 'shopify' | 'sequences' | 'automations' | 'flows'

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

/**
 * Run every delayed-job worker once. Sequential so Hostinger's Node
 * process does not pile four Meta/Shopify bursts on the same tick.
 */
export async function runAllCronJobs(): Promise<CronTickResult> {
  const jobs: CronTickResult['jobs'] = {
    shopify: { status: 500, body: { error: 'not-run' } },
    sequences: { status: 500, body: { error: 'not-run' } },
    automations: { status: 500, body: { error: 'not-run' } },
    flows: { status: 500, body: { error: 'not-run' } },
  }

  const runners: Array<[JobName, () => Promise<Response>]> = [
    ['shopify', runShopifyAbandonedCron],
    ['sequences', runShopifySequenceCron],
    ['automations', runAutomationsCron],
    ['flows', runFlowsCron],
  ]

  for (const [name, fn] of runners) {
    const result = await runJob(name, fn)
    jobs[name] = { status: result.status, body: result.body }
  }

  const ok = Object.values(jobs).every((job) => job.status >= 200 && job.status < 300)
  return { ok, jobs }
}
