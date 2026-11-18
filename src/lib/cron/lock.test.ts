import { afterEach, describe, expect, it } from 'vitest'
import {
  releaseCronTickLock,
  resetCronTickLock,
  tryAcquireCronTickLock,
} from './lock'

afterEach(() => {
  resetCronTickLock()
})

describe('cron tick lock', () => {
  it('is single-flight', () => {
    expect(tryAcquireCronTickLock()).toBe(true)
    expect(tryAcquireCronTickLock()).toBe(false)
    releaseCronTickLock()
    expect(tryAcquireCronTickLock()).toBe(true)
  })
})
