import { afterEach, describe, expect, it } from 'vitest'
import {
  CRON_TICK_LOCK_TTL_MS,
  releaseCronTickLock,
  resetCronTickLock,
  tryAcquireCronTickLock,
} from './lock'

afterEach(() => {
  resetCronTickLock()
})

describe('cron tick lock', () => {
  it('is single-flight', () => {
    expect(tryAcquireCronTickLock().acquired).toBe(true)
    expect(tryAcquireCronTickLock().acquired).toBe(false)
    releaseCronTickLock()
    expect(tryAcquireCronTickLock().acquired).toBe(true)
  })

  it('reports age when blocked', () => {
    const t0 = 1_000_000
    expect(tryAcquireCronTickLock(t0).acquired).toBe(true)
    const blocked = tryAcquireCronTickLock(t0 + 30_000)
    expect(blocked).toEqual({ acquired: false, ageMs: 30_000 })
  })

  it('steals a stale lock after TTL', () => {
    const t0 = 2_000_000
    expect(tryAcquireCronTickLock(t0).acquired).toBe(true)
    const stolen = tryAcquireCronTickLock(t0 + CRON_TICK_LOCK_TTL_MS)
    expect(stolen).toEqual({
      acquired: true,
      stolen: true,
      previousAgeMs: CRON_TICK_LOCK_TTL_MS,
    })
    // New holder still blocks until release / next TTL.
    expect(tryAcquireCronTickLock(t0 + CRON_TICK_LOCK_TTL_MS + 1_000).acquired).toBe(
      false,
    )
  })

  it('does not steal before TTL', () => {
    const t0 = 3_000_000
    expect(tryAcquireCronTickLock(t0).acquired).toBe(true)
    const blocked = tryAcquireCronTickLock(t0 + CRON_TICK_LOCK_TTL_MS - 1)
    expect(blocked.acquired).toBe(false)
  })
})
