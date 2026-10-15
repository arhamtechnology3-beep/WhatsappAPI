import { describe, expect, it } from 'vitest'
import {
  appendWcid,
  newContactLinkToken,
  newUnlockRefCode,
  signShopifyCustomerId,
  verifyShopifyCustomerSignature,
} from './tokens'

describe('tokens', () => {
  it('generates opaque link tokens and short unlock refs', () => {
    expect(newContactLinkToken().length).toBeGreaterThanOrEqual(10)
    expect(newUnlockRefCode()).toMatch(/^[A-F0-9]{6}$/)
  })

  it('appends wcid to absolute and relative URLs', () => {
    expect(appendWcid('https://divyaprabhafoods.com/cart', 'abc')).toBe(
      'https://divyaprabhafoods.com/cart?wcid=abc',
    )
    expect(appendWcid('products/mango?x=1', 'tok')).toBe(
      'products/mango?x=1&wcid=tok',
    )
  })

  it('verifies Shopify customer HMAC', () => {
    const sig = signShopifyCustomerId('12345', 'secret')
    expect(verifyShopifyCustomerSignature('12345', sig, 'secret')).toBe(true)
    expect(verifyShopifyCustomerSignature('12345', 'deadbeef', 'secret')).toBe(
      false,
    )
    expect(verifyShopifyCustomerSignature('12345', sig, 'other')).toBe(false)
  })
})
