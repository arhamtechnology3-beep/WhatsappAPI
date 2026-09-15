import { describe, expect, it } from 'vitest'
import {
  extractHandleFromProductUrl,
  extractProductIdFromLineItems,
  extractProductImageUrlFromLineItems,
  forMetaImageUrl,
} from './product-image'

describe('extractProductImageUrlFromLineItems', () => {
  it('reads checkout featured_image.url', () => {
    expect(
      extractProductImageUrlFromLineItems([
        { title: 'Pickle', featured_image: { url: 'https://cdn.shopify.com/a.jpg' } },
      ]),
    ).toBe('https://cdn.shopify.com/a.jpg?format=jpg&width=1200')
  })

  it('reads a stored image_url', () => {
    expect(
      extractProductImageUrlFromLineItems([
        { title: 'Pickle', image_url: 'https://cdn.shopify.com/b.jpg' },
      ]),
    ).toBe('https://cdn.shopify.com/b.jpg?format=jpg&width=1200')
  })

  it('returns null when no image is present', () => {
    expect(
      extractProductImageUrlFromLineItems([{ title: 'Pickle', product_id: 1 }]),
    ).toBeNull()
  })
})

describe('extractProductIdFromLineItems', () => {
  it('reads numeric product_id', () => {
    expect(extractProductIdFromLineItems([{ product_id: 987 }])).toBe('987')
  })

  it('reads a Product GID', () => {
    expect(
      extractProductIdFromLineItems([
        { product_id: 'gid://shopify/Product/555' },
      ]),
    ).toBe('555')
  })
})

describe('extractHandleFromProductUrl', () => {
  it('parses a storefront product URL', () => {
    expect(
      extractHandleFromProductUrl(
        'https://divyaprabhafoods.com/products/gor-keri?variant=1',
      ),
    ).toBe('gor-keri')
  })
})

describe('forMetaImageUrl', () => {
  it('asks Shopify CDN to serve a sized jpeg even for .jpg paths', () => {
    expect(
      forMetaImageUrl(
        'https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1',
      ),
    ).toBe(
      'https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1&format=jpg&width=1200',
    )
  })

  it('asks Shopify CDN to serve jpeg for webp files', () => {
    expect(
      forMetaImageUrl(
        'https://cdn.shopify.com/s/files/1/x/files/a.webp?v=1',
      ),
    ).toBe(
      'https://cdn.shopify.com/s/files/1/x/files/a.webp?v=1&format=jpg&width=1200',
    )
  })

  it('upgrades protocol-relative Shopify URLs to https', () => {
    expect(forMetaImageUrl('//cdn.shopify.com/s/files/1/x/a.webp')).toContain(
      'https://cdn.shopify.com/',
    )
  })
})
