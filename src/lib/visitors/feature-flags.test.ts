import { describe, expect, it } from 'vitest'
import { isVisitorTrackingEnabled } from './feature-flags'

describe('isVisitorTrackingEnabled', () => {
  it('defaults off', () => {
    expect(isVisitorTrackingEnabled(undefined)).toBe(false)
    expect(isVisitorTrackingEnabled('')).toBe(false)
    expect(isVisitorTrackingEnabled('0')).toBe(false)
  })

  it('opts in on common truthy values', () => {
    expect(isVisitorTrackingEnabled('1')).toBe(true)
    expect(isVisitorTrackingEnabled('true')).toBe(true)
    expect(isVisitorTrackingEnabled('YES')).toBe(true)
  })
})
