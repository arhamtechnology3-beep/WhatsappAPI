import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_STOREFRONT_ORIGIN,
  toCustomerStoreName,
  toCustomerStoreUrl,
} from './storefront-url'

describe('toCustomerStoreUrl', () => {
  it('rewrites abandoned checkout hosts', () => {
    expect(
      toCustomerStoreUrl(
        'https://divyaprabhafoods.myshopify.com/123/checkouts/abc',
      ),
    ).toBe('https://divyaprabhafoods.com/123/checkouts/abc')
  })

  it('rewrites a bare myshopify host', () => {
    expect(toCustomerStoreUrl('divyaprabhafoods.myshopify.com')).toBe(
      `${CUSTOMER_STOREFRONT_ORIGIN}/`,
    )
  })

  it('uses the custom domain when empty', () => {
    expect(toCustomerStoreUrl('')).toBe(`${CUSTOMER_STOREFRONT_ORIGIN}/`)
  })
})

describe('toCustomerStoreName', () => {
  it('does not put the myshopify host in template copy', () => {
    expect(toCustomerStoreName('divyaprabhafoods.myshopify.com')).toBe(
      'DivyaPrabha Foods',
    )
  })
})
