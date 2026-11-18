/** Default in-process cadence on Hostinger (90 minutes). */
export const DEFAULT_CRON_INTERVAL_MS = 90 * 60 * 1000

/** Floor so a typo cannot spin the Node process every few ms. */
export const MIN_CRON_INTERVAL_MS = 60_000

/**
 * Resolve `CRON_INTERVAL_MS` from the environment.
 * Invalid / missing / below the floor → default 90 minutes.
 */
export function resolveCronIntervalMs(
  raw: string | undefined = process.env.CRON_INTERVAL_MS,
): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < MIN_CRON_INTERVAL_MS) {
    return DEFAULT_CRON_INTERVAL_MS
  }
  return n
}
