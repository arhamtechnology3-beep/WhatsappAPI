import { describe, expect, it } from 'vitest'
import {
  cartPermalinkFromEvents,
  classifyNudge,
  mostViewedProduct,
} from './recovery-cron'

describe('classifyNudge', () => {
  it('prefers cart over browse over visit', () => {
    expect(
      classifyNudge({
        cart_events: [{ type: 'add_to_cart', variant_id: '1' }],
        products_viewed: [{ handle: 'mango' }],
      }),
    ).toBe('cart')
    expect(
      classifyNudge({
        cart_events: [],
        products_viewed: [{ handle: 'mango' }],
      }),
    ).toBe('browse')
    expect(classifyNudge({ cart_events: [], products_viewed: [] })).toBe(
      'visit',
    )
  })
})

describe('mostViewedProduct', () => {
  it('picks the product viewed most often', () => {
    const p = mostViewedProduct([
      { product_id: '1', title: 'A' },
      { product_id: '2', title: 'B' },
      { product_id: '1', title: 'A' },
    ])
    expect(p?.product_id).toBe('1')
  })
})

describe('cartPermalinkFromEvents', () => {
  it('builds a cart permalink from add_to_cart events', () => {
    const url = cartPermalinkFromEvents([
      { type: 'add_to_cart', variant_id: '111', quantity: 2 },
      { type: 'add_to_cart', variant_id: '222', quantity: 1 },
      { type: 'remove_from_cart', variant_id: '333' },
    ])
    expect(url).toContain('/cart/111:2,222:1')
  })

  it('returns null without variants', () => {
    expect(cartPermalinkFromEvents([{ type: 'add_to_cart' }])).toBeNull()
  })
})
