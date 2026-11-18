/**
 * Single-flight lock for `/api/cron/tick` and the in-process ticker.
 *
 * On Hostinger both paths share one Node process. Without this lock a
 * slow tick (Meta + Shopify + visitor scans) still running when the next
 * minute fires starts a second full pass — CPU piles up until the plan
 * hits ~100% and the site returns 503/504.
 */

type LockGlobal = typeof globalThis & {
  __wacrmCronTickRunning?: boolean
}

function lockState(): LockGlobal {
  return globalThis as LockGlobal
}

export function tryAcquireCronTickLock(): boolean {
  const g = lockState()
  if (g.__wacrmCronTickRunning) return false
  g.__wacrmCronTickRunning = true
  return true
}

export function releaseCronTickLock() {
  lockState().__wacrmCronTickRunning = false
}

/** Test helper. */
export function resetCronTickLock() {
  lockState().__wacrmCronTickRunning = false
}
