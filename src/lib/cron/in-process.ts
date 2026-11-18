import { cronSecretConfigured } from '@/lib/cron/auth'
import { resolveCronIntervalMs } from '@/lib/cron/interval'

/**
 * Wait before the first tick so `next start` can answer HTTP (health,
 * login) before Meta/Shopify/visitor work piles on. On a saturated
 * Hostinger plan, a 15s first tick was enough to keep nginx at 504.
 */
const FIRST_DELAY_MS = 90_000

type CronGlobal = typeof globalThis & {
  __wacrmCronTimer?: ReturnType<typeof setInterval>
  __wacrmCronStarted?: boolean
}

function cronGlobal(): CronGlobal {
  return globalThis as CronGlobal
}

/**
 * Tick delayed automations from `next start` itself.
 *
 * Live is Hostinger Node, not Vercel, so vercel.json crons never fire.
 * Without this loop, cart / sequence / wait-step jobs only send when
 * something else GETs the cron routes (often a dashboard visit).
 *
 * Skip on Vercel (platform cron covers it). Hostinger should still add
 * an hPanel cron to GET /api/cron/tick so a sleeping Node process wakes
 * even if this timer is paused. Default cadence is 90 minutes (override
 * with `CRON_INTERVAL_MS`); overlapping ticks are single-flight locked.
 */
export function startInProcessCron() {
  if (process.env.VERCEL) return
  if (process.env.DISABLE_IN_PROCESS_CRON === '1') return
  if (process.env.NODE_ENV === 'test') return

  const g = cronGlobal()
  if (g.__wacrmCronStarted) return
  g.__wacrmCronStarted = true

  const intervalMs = resolveCronIntervalMs()

  if (!cronSecretConfigured()) {
    console.warn(
      '[cron] AUTOMATION_CRON_SECRET / CRON_SECRET is not set — GET /api/cron/tick will 503. In-process ticker still runs while Node is up. Set the secret and add an hPanel cron so a sleeping process still wakes.',
    )
  } else {
    console.info(
      `[cron] in-process ticker every ${Math.round(intervalMs / 1000)}s after ${Math.round(FIRST_DELAY_MS / 1000)}s warm-up (CRON_INTERVAL_MS)`,
    )
  }

  const tick = async () => {
    try {
      const { runAllCronJobs } = await import('@/lib/cron/tick')
      const result = await runAllCronJobs()
      if (result.skipped === 'already_running') {
        console.warn('[cron] in-process tick skipped — prior tick still running')
        return
      }
      if (!result.ok) {
        console.error('[cron] in-process tick had failures', result.jobs)
      }
    } catch (err) {
      console.error('[cron] in-process tick failed', err)
    }
  }

  setTimeout(() => {
    void tick()
    if (g.__wacrmCronTimer) return
    g.__wacrmCronTimer = setInterval(() => {
      void tick()
    }, intervalMs)
  }, FIRST_DELAY_MS)
}
