/**
 * Single-flight lock for `/api/cron/tick` and the in-process ticker.
 *
 * On Hostinger both paths share one Node process. Without this lock a
 * slow tick (Meta + Shopify + visitor scans) still running when the next
 * minute fires starts a second full pass — CPU piles up until the plan
 * hits ~100% and the site returns 503/504.
 *
 * A hung job (Meta/Shopify stall) used to hold a bare boolean forever, so
 * every later curl returned `already_running` with `not-run` jobs and
 * follow-ups never sent. Stale locks older than CRON_TICK_LOCK_TTL_MS
 * are stolen so a stuck tick cannot block the next healthy one forever.
 */

/** Max time a tick may hold the lock before the next caller steals it. */
export const CRON_TICK_LOCK_TTL_MS = 8 * 60 * 1000

type LockGlobal = typeof globalThis & {
  __wacrmCronTickRunning?: boolean
  __wacrmCronTickStartedAt?: number
}

function lockState(): LockGlobal {
  return globalThis as LockGlobal
}

export type CronLockAcquire =
  | { acquired: true; stolen?: boolean; previousAgeMs?: number }
  | { acquired: false; ageMs: number }

export function tryAcquireCronTickLock(
  nowMs: number = Date.now(),
  ttlMs: number = CRON_TICK_LOCK_TTL_MS,
): CronLockAcquire {
  const g = lockState()
  if (!g.__wacrmCronTickRunning) {
    g.__wacrmCronTickRunning = true
    g.__wacrmCronTickStartedAt = nowMs
    return { acquired: true }
  }

  const startedAt = g.__wacrmCronTickStartedAt ?? nowMs
  const ageMs = Math.max(0, nowMs - startedAt)

  if (ageMs >= ttlMs) {
    g.__wacrmCronTickRunning = true
    g.__wacrmCronTickStartedAt = nowMs
    console.warn(
      `[cron] stole stale tick lock after ${ageMs}ms (ttl=${ttlMs}ms)`,
    )
    return { acquired: true, stolen: true, previousAgeMs: ageMs }
  }

  return { acquired: false, ageMs }
}

export function releaseCronTickLock() {
  const g = lockState()
  g.__wacrmCronTickRunning = false
  g.__wacrmCronTickStartedAt = undefined
}

/** Test helper. */
export function resetCronTickLock() {
  releaseCronTickLock()
}
