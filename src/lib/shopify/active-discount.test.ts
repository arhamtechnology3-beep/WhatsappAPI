import { describe, expect, it } from 'vitest'
import {
  formatDiscountOffer,
  pickActiveDiscountFromGraphql,
} from './active-discount'

const df10Payload = {
  data: {
    codeDiscountNodes: {
      nodes: [
        {
          codeDiscount: {
            __typename: 'DiscountCodeBasic',
            title: 'DF10',
            status: 'ACTIVE',
            startsAt: '2026-01-01T00:00:00Z',
            endsAt: null,
            codes: { nodes: [{ code: 'DF10' }] },
            customerGets: { value: { percentage: 10 } },
            minimumRequirement: {
              greaterThanOrEqualToSubtotal: { amount: '749.0' },
            },
          },
        },
        {
          codeDiscount: {
            __typename: 'DiscountCodeBasic',
            title: 'Naman',
            status: 'EXPIRED',
            codes: { nodes: [{ code: 'NAMAN' }] },
            customerGets: { value: { percentage: 90 } },
          },
        },
      ],
    },
  },
}

describe('pickActiveDiscountFromGraphql', () => {
  it('picks the active code discount and skips expired ones', () => {
    expect(pickActiveDiscountFromGraphql(df10Payload)).toEqual({
      code: 'DF10',
      title: 'DF10',
      percentOff: 10,
      amountOff: null,
      minSubtotal: 749,
    })
  })

  it('returns null when there is no active code', () => {
    expect(
      pickActiveDiscountFromGraphql({
        data: { codeDiscountNodes: { nodes: [] } },
      }),
    ).toBeNull()
  })
})

describe('formatDiscountOffer', () => {
  const discount = {
    code: 'DF10',
    title: 'DF10',
    percentOff: 10,
    amountOff: null,
    minSubtotal: 749,
  }

  it('mentions the Shopify code when the cart meets the minimum', () => {
    expect(formatDiscountOffer(discount, 800)).toContain('DF10')
    expect(formatDiscountOffer(discount, 800)).toContain('10%')
  })

  it('tells the shopper how much more to add when under the minimum', () => {
    const text = formatDiscountOffer(discount, 500)
    expect(text).toContain('DF10')
    expect(text).toContain('₹249')
  })
})
