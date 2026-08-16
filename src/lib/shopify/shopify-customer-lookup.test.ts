import { describe, expect, it } from 'vitest'
import {
  isWeakContactName,
  pickPreferredShopifyCustomer,
  shopifyCustomerSearchQueries,
  shouldReplaceContactName,
} from './shopify-customer-lookup'

describe('shopifyCustomerSearchQueries', () => {
  it('covers Meta, +91, and 10-digit forms for an Indian mobile', () => {
    const q = shopifyCustomerSearchQueries('919167623044', 'vidhi@arhamadvertising.com')
    expect(q).toEqual(
      expect.arrayContaining([
        'phone:919167623044',
        'phone:+919167623044',
        'phone:9167623044',
        'phone:+919167623044',
        'email:vidhi@arhamadvertising.com',
      ]),
    )
    expect(q).toContain('phone:+91' + '9167623044')
  })
})

describe('pickPreferredShopifyCustomer', () => {
  it('prefers the Shopify customer that already has orders', () => {
    const pick = pickPreferredShopifyCustomer([
      { id: '9103920201942', first_name: 'Vidhi', orders_count: 0 },
      {
        id: '9129655992534',
        first_name: 'Vidhi',
        email: 'vidhi@arhamadvertising.com',
        orders_count: 2,
      },
    ])
    expect(String(pick?.id)).toBe('9129655992534')
  })
})

describe('shouldReplaceContactName', () => {
  it('lets Shopify Admin replace JESAL leftover from WhatsApp/checkout', () => {
    expect(
      shouldReplaceContactName({
        existingName: 'JESAL PANCHAL',
        incomingName: 'Vidhi Panchal',
        mode: 'replace',
      }),
    ).toBe(true)
  })

  it('does not let checkout fill overwrite a real Shopify name', () => {
    expect(
      shouldReplaceContactName({
        existingName: 'Vidhi Panchal',
        incomingName: 'JESAL PANCHAL',
        mode: 'fill',
      }),
    ).toBe(false)
  })

  it('fills when the stored name is empty or a placeholder', () => {
    expect(
      shouldReplaceContactName({
        existingName: 'Shopify Customer',
        incomingName: 'Vidhi Panchal',
        mode: 'fill',
      }),
    ).toBe(true)
  })
})

describe('isWeakContactName', () => {
  it('treats a phone used as the name as weak', () => {
    expect(isWeakContactName('919167623044', '919167623044')).toBe(true)
    expect(isWeakContactName('Vidhi Panchal', '919167623044')).toBe(false)
  })
})
