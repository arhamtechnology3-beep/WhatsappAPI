import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  _resetStorefrontCatalogCache,
  extractHandleFromProductUrl,
  extractProductIdFromLineItems,
  extractProductImageUrlFromLineItems,
  fetchStorefrontProductImageById,
  forMetaImageUrl,
  formatItemsSummary,
  imageFromCatalogProduct,
  resolveOrderHeaderImage,
} from './product-image'

vi.mock('@/lib/shopify/shopify-client', () => ({
  fetchShopify: vi.fn(async () => {
    throw new Error('admin api unavailable')
  }),
}))

const CATALOG = {
  products: [
    {
      id: 1,
      title: 'Katka Keri',
      images: [{ src: 'https://cdn.shopify.com/katka.jpg', variant_ids: [] }],
      variants: [{ id: 11 }],
    },
    {
      id: 2,
      title: 'Homemade Mango Pickle',
      images: [
        { src: 'https://cdn.shopify.com/mango.jpg', variant_ids: [] },
        { src: 'https://cdn.shopify.com/mango-500.jpg', variant_ids: [22] },
      ],
      variants: [{ id: 21 }, { id: 22 }],
    },
  ],
}

function stubStorefront() {
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'store.example')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
  )
}

function fakeDb(orders: Array<{ id: string; shopify_order_id: string; line_items: unknown }>) {
  const updates: unknown[] = []
  const db = {
    from: () => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data:
            orders.find(
              (o) =>
                !filters.shopify_order_id ||
                o.shopify_order_id === filters.shopify_order_id,
            ) ?? null,
        }),
        update: (row: unknown) => {
          updates.push(row)
          return { eq: async () => ({}) }
        },
      }
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, updates }
}

afterEach(() => {
  _resetStorefrontCatalogCache()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('formatItemsSummary', () => {
  it('lists every product with variant and quantity on one line', () => {
    expect(
      formatItemsSummary([
        { title: 'Methia Keri | Chana Keri Methi Achar', quantity: 1 },
        { title: 'Gor Keri | Jaggery Mango Achar', variant_title: '500 g', quantity: 2 },
        { title: 'Gunda Keri', variant_title: 'Default Title', quantity: 1 },
      ]),
    ).toBe(
      'Methia Keri | Chana Keri Methi Achar × 1, Gor Keri | Jaggery Mango Achar (500 g) × 2, Gunda Keri × 1',
    )
  })

  it('caps long orders and never emits newlines', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ title: `P${i}\n`, quantity: 1 }))
    const out = formatItemsSummary(items)
    expect(out).toContain('+2 more')
    expect(out).not.toMatch(/\n/)
  })
})

describe('imageFromCatalogProduct', () => {
  it('prefers the image tagged for the ordered variant', () => {
    expect(imageFromCatalogProduct(CATALOG.products[1], '22')).toContain('mango-500.jpg')
  })

  it('falls back to the product main image', () => {
    expect(imageFromCatalogProduct(CATALOG.products[1], '21')).toContain('mango.jpg')
  })
})

describe('fetchStorefrontProductImageById', () => {
  it('finds the product by id in the public catalog', async () => {
    stubStorefront()
    expect(await fetchStorefrontProductImageById(2)).toContain('mango.jpg')
    expect(await fetchStorefrontProductImageById(999)).toBeNull()
  })
})

describe('resolveOrderHeaderImage', () => {
  it('uses the ordered product, not the first catalog product, and persists it', async () => {
    stubStorefront()
    const { db, updates } = fakeDb([
      {
        id: 'row-1',
        shopify_order_id: '1014',
        line_items: [{ title: 'Homemade Mango Pickle', product_id: 2, variant_id: 22 }],
      },
    ])
    const url = await resolveOrderHeaderImage(db, {
      contactId: 'c1',
      shopifyOrderId: '1014',
    })
    expect(url).toContain('mango-500.jpg')
    expect(url).not.toContain('katka')
    expect(updates).toHaveLength(1)
  })

  it('returns null (brand fallback) when the product cannot be found', async () => {
    stubStorefront()
    const { db } = fakeDb([
      { id: 'row-1', shopify_order_id: '1', line_items: [{ title: 'Gone', product_id: 404 }] },
    ])
    expect(await resolveOrderHeaderImage(db, { contactId: 'c1', shopifyOrderId: '1' })).toBeNull()
  })
})

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
