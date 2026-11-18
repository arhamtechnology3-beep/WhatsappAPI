/** Default in-process / recommended hPanel cadence on Hostinger (3 min). */
export const DEFAULT_CRON_INTERVAL_MS = 180_000

/** Floor so a typo cannot spin the Node process every few ms. */
export const MIN_CRON_INTERVAL_MS = 60_000

/**
 * Resolve `CRON_INTERVAL_MS` from the environment.
 * Invalid / missing / below the floor → default 3 minutes.
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
