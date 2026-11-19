/**
 * Hostinger shared-hosting load profile.
 *
 * The Advertising Business plan caps Max processes (NPROC) at 120 across
 * every site. A full 9-job cron tick + webhook `after()` sends + IdentityFlow
 * traffic is enough to keep that meter near 100% even when hPanel only curls
 * once every few hours.
 *
 * Default on non-Vercel hosts: run a **light** job set with tiny batches.
 * Set `CRON_PROFILE=full` only when the plan has headroom (or you are on Vercel).
 */

export type CronJobName =
  | 'shopify'
  | 'sequences'
  | 'automations'
  | 'flows'
  | 'identityflow'
  | 'shipments'
  | 'templates'
  | 'followups'
  | 'visitors'

export const ALL_CRON_JOBS: CronJobName[] = [
  'shopify',
  'sequences',
  'automations',
  'flows',
  'identityflow',
  'shipments',
  'templates',
  'followups',
  'visitors',
]

/** Minimal set that still drains WhatsApp sends + due drips. */
export const HOSTINGER_CRON_JOBS: CronJobName[] = [
  'shopify',
  'sequences',
  'followups',
]

export type CronProfile = 'hostinger' | 'full'

type EnvLike = Record<string, string | undefined>

export function isAllCronDisabled(env: EnvLike = process.env): boolean {
  return env.DISABLE_ALL_CRON === '1'
}

export function resolveCronProfile(env: EnvLike = process.env): CronProfile {
  const raw = env.CRON_PROFILE?.trim().toLowerCase()
  if (raw === 'full') return 'full'
  if (raw === 'hostinger') return 'hostinger'
  // Self-hosted / Hostinger: light by default. Vercel has separate cron workers.
  if (env.VERCEL) return 'full'
  return 'hostinger'
}

export function enabledCronJobs(env: EnvLike = process.env): Set<CronJobName> {
  const allow = env.CRON_JOBS?.trim()
  if (allow) {
    const names = allow
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is CronJobName =>
        (ALL_CRON_JOBS as string[]).includes(s),
      )
    return new Set(names)
  }
  return new Set(
    resolveCronProfile(env) === 'hostinger'
      ? HOSTINGER_CRON_JOBS
      : ALL_CRON_JOBS,
  )
}

/** Hard caps so one tick cannot scan unbounded tables or Meta-send forever. */
export function cronBatchLimits(env: EnvLike = process.env) {
  const light = resolveCronProfile(env) === 'hostinger'
  return {
    abandonedCheckouts: light ? 8 : 40,
    sequenceTrackings: light ? 5 : 40,
    sendJobs: light ? 3 : 20,
    followups: light ? 5 : 25,
    immediateSendJobs: light ? 1 : 20,
  }
}

export function isImmediateWhatsAppSendDisabled(
  env: EnvLike = process.env,
): boolean {
  return env.DISABLE_IMMEDIATE_WHATSAPP_SEND === '1'
}

/**
 * Child cron URLs (`/api/shopify/cron`, etc.) duplicate work already done by
 * `/api/cron/tick`. On Hostinger they must stay closed so leftover hPanel jobs
 * cannot multiply load.
 */
export function areChildCronRoutesDisabled(env: EnvLike = process.env): boolean {
  if (env.ALLOW_CHILD_CRON_ROUTES === '1') return false
  if (env.VERCEL) return false
  return true
}
