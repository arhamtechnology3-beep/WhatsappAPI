import { describe, expect, it } from 'vitest'
import { parseShopifyLinkRelNext, shopifyGidToNumericId } from './shopify-client'

describe('parseShopifyLinkRelNext', () => {
  it('returns the next URL from a Shopify Link header', () => {
    const header =
      '<https://store.myshopify.com/admin/api/2025-01/customers.json?limit=250&page_info=abc>; rel="next"'
    expect(parseShopifyLinkRelNext(header)).toBe(
      'https://store.myshopify.com/admin/api/2025-01/customers.json?limit=250&page_info=abc'
    )
  })

  it('prefers rel=next when previous is also present', () => {
    const header =
      '<https://store.myshopify.com/admin/api/2025-01/customers.json?page_info=prev>; rel="previous", <https://store.myshopify.com/admin/api/2025-01/customers.json?page_info=nxt>; rel="next"'
    expect(parseShopifyLinkRelNext(header)).toBe(
      'https://store.myshopify.com/admin/api/2025-01/customers.json?page_info=nxt'
    )
  })

  it('returns null when there is no next page', () => {
    expect(parseShopifyLinkRelNext(null)).toBeNull()
    expect(
      parseShopifyLinkRelNext(
        '<https://store.myshopify.com/admin/api/2025-01/customers.json?page_info=prev>; rel="previous"'
      )
    ).toBeNull()
  })
})

describe('shopifyGidToNumericId', () => {
  it('extracts the numeric id from a Customer GID', () => {
    expect(shopifyGidToNumericId('gid://shopify/Customer/123456')).toBe('123456')
    expect(shopifyGidToNumericId(123456)).toBe('123456')
  })
})
