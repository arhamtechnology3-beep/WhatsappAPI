import { afterEach, describe, expect, it } from 'vitest'
import { resetCronThrottles, shouldRunThrottled } from './throttle'

afterEach(() => {
  resetCronThrottles()
})

describe('shouldRunThrottled', () => {
  it('allows the first call then cools down', () => {
    expect(shouldRunThrottled('job', 60_000, 1_000_000)).toBe(true)
    expect(shouldRunThrottled('job', 60_000, 1_030_000)).toBe(false)
    expect(shouldRunThrottled('job', 60_000, 1_060_000)).toBe(true)
  })

  it('tracks keys independently', () => {
    expect(shouldRunThrottled('a', 60_000, 1)).toBe(true)
    expect(shouldRunThrottled('b', 60_000, 1)).toBe(true)
  })
})
