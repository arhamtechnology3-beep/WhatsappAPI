import { cronSecretConfigured } from '@/lib/cron/auth'

const INTERVAL_MS = 60_000
const FIRST_DELAY_MS = 15_000

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
 * a 1-minute hPanel cron to GET /api/cron/tick so a sleeping Node
 * process wakes even if this timer is paused.
 */
export function startInProcessCron() {
  if (process.env.VERCEL) return
  if (process.env.DISABLE_IN_PROCESS_CRON === '1') return
  if (process.env.NODE_ENV === 'test') return

  const g = cronGlobal()
  if (g.__wacrmCronStarted) return
  g.__wacrmCronStarted = true

  if (!cronSecretConfigured()) {
    console.warn(
      '[cron] AUTOMATION_CRON_SECRET / CRON_SECRET is not set — GET /api/cron/tick will 503. In-process ticker still runs while Node is up. Set the secret and add an hPanel cron so a sleeping process still wakes.',
    )
  }

  const tick = async () => {
    try {
      const { runAllCronJobs } = await import('@/lib/cron/tick')
      const result = await runAllCronJobs()
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
    }, INTERVAL_MS)
  }, FIRST_DELAY_MS)
}
