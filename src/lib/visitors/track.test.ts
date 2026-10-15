import { describe, expect, it } from 'vitest'
import {
  isVisitorTrackEvent,
  sanitizeVisitorPayload,
} from './track'

describe('isVisitorTrackEvent', () => {
  it('allows the planned vocabulary', () => {
    expect(isVisitorTrackEvent('page_view')).toBe(true)
    expect(isVisitorTrackEvent('product_view')).toBe(true)
    expect(isVisitorTrackEvent('add_to_cart')).toBe(true)
    expect(isVisitorTrackEvent('hack')).toBe(false)
  })
})

describe('sanitizeVisitorPayload', () => {
  it('strips PII keys and query strings from URLs', () => {
    const out = sanitizeVisitorPayload({
      phone: '919999999999',
      email: 'a@b.com',
      title: 'Mango Pickle',
      url: 'https://divyaprabhafoods.com/products/mango?wcid=abc&utm=1',
      nested: { password: 'x', handle: 'mango' },
    })
    expect(out.phone).toBeUndefined()
    expect(out.email).toBeUndefined()
    expect(out.title).toBe('Mango Pickle')
    expect(out.url).toBe('https://divyaprabhafoods.com/products/mango')
    expect(out.nested).toEqual({ handle: 'mango' })
  })
})
