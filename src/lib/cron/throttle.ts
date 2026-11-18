/**
 * In-process cooldown helpers for Hostinger cron ticks.
 *
 * Shared hosting collapses when every-minute work stacks (in-process
 * ticker + hPanel curl + slow Meta/Shopify round-trips). Jobs that do
 * not need sub-minute latency should call `shouldRunThrottled` and
 * return early when still cooling down.
 */

type ThrottleGlobal = typeof globalThis & {
  __wacrmCronThrottle?: Map<string, number>
}

function store(): Map<string, number> {
  const g = globalThis as ThrottleGlobal
  if (!g.__wacrmCronThrottle) g.__wacrmCronThrottle = new Map()
  return g.__wacrmCronThrottle
}

/** True when enough time has passed since the last successful claim. */
export function shouldRunThrottled(
  key: string,
  intervalMs: number,
  now = Date.now(),
): boolean {
  if (intervalMs <= 0) return true
  const last = store().get(key)
  if (last != null && now - last < intervalMs) return false
  store().set(key, now)
  return true
}

/** Test helper — clears all throttle marks. */
export function resetCronThrottles() {
  store().clear()
}
