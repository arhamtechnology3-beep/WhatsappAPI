import { describe, expect, it } from 'vitest'
import {
  formatOrderStatusMessage,
  orderMatchesQuery,
  orderNumberCandidates,
} from './shopify-order-lookup'

describe('orderNumberCandidates', () => {
  it('covers 1006, #1006, and digit-only forms', () => {
    expect(orderNumberCandidates('1006')).toEqual(
      expect.arrayContaining(['1006', '#1006']),
    )
    expect(orderNumberCandidates('#1006')).toEqual(
      expect.arrayContaining(['1006', '#1006']),
    )
  })
})

describe('orderMatchesQuery', () => {
  it('matches Shopify name #1006 to typed 1006', () => {
    expect(orderMatchesQuery({ name: '#1006', order_number: 1006 }, '1006')).toBe(
      true,
    )
  })

  it('matches DivyaPrabha DP/26/1009 suffix', () => {
    expect(
      orderMatchesQuery({ name: 'DP/26/1009', order_number: 1009 }, '1009'),
    ).toBe(true)
  })

  it('rejects a different order', () => {
    expect(orderMatchesQuery({ name: '#1001', order_number: 1001 }, '1006')).toBe(
      false,
    )
  })
})

describe('formatOrderStatusMessage', () => {
  it('includes payment, items, and a concern CTA', () => {
    const text = formatOrderStatusMessage({
      name: '#1006',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '599.00',
      currency: 'INR',
      line_items: [{ title: 'Gor Keri', quantity: 1 }],
    })
    expect(text).toContain('Order #1006 mil gaya')
    expect(text).toContain('Payment: paid')
    expect(text).toContain('Gor Keri × 1')
    expect(text).toContain('Talk to agent')
  })
})
