import { describe, expect, it } from 'vitest'
import {
  shouldStopBrowseDrip,
  shouldStopCartDrip,
} from './recovery-conversion'

describe('shouldStopCartDrip', () => {
  it('stops only when the linked checkout is recovered', () => {
    expect(shouldStopCartDrip('recovered')).toBe(true)
    expect(shouldStopCartDrip('open')).toBe(false)
    expect(shouldStopCartDrip(null)).toBe(false)
  })
})

describe('shouldStopBrowseDrip', () => {
  it('stops on later cart or order for that contact', () => {
    expect(
      shouldStopBrowseDrip({
        addedToCartAfterStart: false,
        orderedAfterStart: false,
      }),
    ).toBe(false)
    expect(
      shouldStopBrowseDrip({
        addedToCartAfterStart: true,
        orderedAfterStart: false,
      }),
    ).toBe(true)
    expect(
      shouldStopBrowseDrip({
        addedToCartAfterStart: false,
        orderedAfterStart: true,
      }),
    ).toBe(true)
  })
})
