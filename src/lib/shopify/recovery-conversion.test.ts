import { describe, expect, it } from 'vitest'
import {
  orderCoversCheckout,
  shouldStopBrowseDrip,
  shouldStopCartDrip,
} from './recovery-conversion'

describe('orderCoversCheckout', () => {
  const gundaKeri = { variant_id: 48331213177046, product_id: 9374510907606 }
  const gorKeri = { variant_id: 48331213537494, product_id: 9374511202518 }
  const katkaKeri = { variant_id: 111, product_id: 222 }

  it('matches a MagicCheckout order to the cart with the same items (order DP/26/1017)', () => {
    expect(orderCoversCheckout([gundaKeri, gorKeri], [gundaKeri, gorKeri])).toBe(true)
  })

  it('matches when the order has any product from the cart', () => {
    expect(orderCoversCheckout([gorKeri], [gundaKeri, gorKeri])).toBe(true)
  })

  it('leaves a different cart alone', () => {
    expect(orderCoversCheckout([katkaKeri], [gundaKeri, gorKeri])).toBe(false)
  })

  it('compares variant ids as strings and falls back to products', () => {
    expect(orderCoversCheckout([{ variant_id: '111' }], [{ variant_id: 111 }])).toBe(true)
    expect(orderCoversCheckout([{ product_id: 222 }], [{ product_id: '222' }])).toBe(true)
  })

  it('is false when either side has no items', () => {
    expect(orderCoversCheckout([], [gorKeri])).toBe(false)
    expect(orderCoversCheckout(null, [gorKeri])).toBe(false)
    expect(orderCoversCheckout([gorKeri], undefined)).toBe(false)
  })
})

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
