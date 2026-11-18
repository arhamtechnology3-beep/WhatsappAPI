import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CRON_INTERVAL_MS,
  MIN_CRON_INTERVAL_MS,
  resolveCronIntervalMs,
} from './interval'

describe('resolveCronIntervalMs', () => {
  it('defaults to 90 minutes when unset or invalid', () => {
    expect(DEFAULT_CRON_INTERVAL_MS).toBe(90 * 60 * 1000)
    expect(resolveCronIntervalMs(undefined)).toBe(DEFAULT_CRON_INTERVAL_MS)
    expect(resolveCronIntervalMs('')).toBe(DEFAULT_CRON_INTERVAL_MS)
    expect(resolveCronIntervalMs('nope')).toBe(DEFAULT_CRON_INTERVAL_MS)
    expect(resolveCronIntervalMs('0')).toBe(DEFAULT_CRON_INTERVAL_MS)
    expect(resolveCronIntervalMs('30000')).toBe(DEFAULT_CRON_INTERVAL_MS)
  })

  it('accepts values at or above the floor', () => {
    expect(resolveCronIntervalMs(String(MIN_CRON_INTERVAL_MS))).toBe(
      MIN_CRON_INTERVAL_MS,
    )
    expect(resolveCronIntervalMs('300000')).toBe(300_000)
  })
})
