import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchShopify } from '@/lib/shopify/shopify-client'

function asHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function withHttps(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return trimmed
}

/** Meta image headers want jpeg/png; Shopify CDN often content-negotiates webp. */
export function forMetaImageUrl(url: string): string {
  try {
    const parsed = new URL(withHttps(url))
    if (parsed.protocol === 'http:') parsed.protocol = 'https:'
    const host = parsed.hostname.toLowerCase()
    const isShopifyCdn =
      host === 'cdn.shopify.com' ||
      host.endsWith('.shopify.com') ||
      host.endsWith('.myshopify.com')
    if (isShopifyCdn) {
      parsed.searchParams.set('format', 'jpg')
      if (!parsed.searchParams.has('width') && !parsed.searchParams.has('height')) {
        parsed.searchParams.set('width', '1200')
      }
    } else if (/\.webp$/i.test(parsed.pathname)) {
      parsed.searchParams.set('format', 'jpg')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function storefrontOrigin(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ||
    process.env.SHOPIFY_STORE_DOMAIN ||
    ''
  const domain = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!domain) return null
  return `https://${domain}`
}

function imageSrcFromProduct(product: Record<string, unknown> | null | undefined): string | null {
  if (!product) return null
  const images = product.images
  const firstImage = Array.isArray(images) ? images[0] : null
  const firstObj =
    firstImage && typeof firstImage === 'object'
      ? (firstImage as Record<string, unknown>)
      : null
  const src =
    asHttpUrl(product.featured_image) ||
    asHttpUrl((product.image as Record<string, unknown> | undefined)?.src) ||
    asHttpUrl(firstObj?.src) ||
    asHttpUrl(firstImage)
  return src ? forMetaImageUrl(src) : null
}

async function fetchStorefrontJson(path: string): Promise<unknown | null> {
  const origin = storefrontOrigin()
  if (!origin) return null
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'wacrm/1.0' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn(
      '[shopify-product-image] storefront fetch failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

function pickImageFromItem(item: Record<string, unknown>): string | null {
  const featured = item.featured_image
  const image = item.image
  const variant = item.variant as Record<string, unknown> | undefined
  const product = item.product as Record<string, unknown> | undefined
  const featuredObj = featured && typeof featured === 'object'
    ? (featured as Record<string, unknown>)
    : null
  const imageObj = image && typeof image === 'object'
    ? (image as Record<string, unknown>)
    : null
  const variantImage = variant?.image as Record<string, unknown> | undefined
  const productImage = product?.image as Record<string, unknown> | undefined

  const src =
    asHttpUrl(item.image_url) ||
    asHttpUrl(image) ||
    asHttpUrl(imageObj?.src) ||
    asHttpUrl(imageObj?.url) ||
    asHttpUrl(featured) ||
    asHttpUrl(featuredObj?.url) ||
    asHttpUrl(featuredObj?.src) ||
    asHttpUrl(variantImage?.src) ||
    asHttpUrl(productImage?.src) ||
    asHttpUrl(product?.featured_image) ||
    null
  return src ? forMetaImageUrl(src) : null
}

function shopifyNumericId(raw: unknown, kind: 'Product' | 'ProductVariant'): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  const gid = s.match(new RegExp(`${kind}\\/(\\d+)`))
  if (gid) return gid[1]
  if (/^\d+$/.test(s)) return s
  return null
}

export function extractProductImageUrlFromLineItems(lineItems: unknown): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue
    const url = pickImageFromItem(raw as Record<string, unknown>)
    if (url) return url
  }
  return null
}

export function extractProductTitleFromLineItems(lineItems: unknown): string {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return ''
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const title = item.title || item.name
    if (typeof title === 'string' && title.trim()) return title.trim()
  }
  return ''
}

export function extractProductIdFromLineItems(lineItems: unknown): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const product = item.product as Record<string, unknown> | undefined
    const id =
      shopifyNumericId(item.product_id, 'Product') ||
      shopifyNumericId(product?.id, 'Product')
    if (id) return id
  }
  return null
}

export function extractHandleFromProductUrl(productUrl: unknown): string | null {
  if (typeof productUrl !== 'string') return null
  try {
    const path = new URL(productUrl).pathname
    const match = path.match(/\/products\/([^/?#]+)/i)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    const match = productUrl.match(/\/products\/([^/?#]+)/i)
    return match ? decodeURIComponent(match[1]) : null
  }
}

/** Any published product image from the live store catalog (no Admin token). */
export async function fetchShopifyCatalogHeaderImage(): Promise<string | null> {
  const data = (await fetchStorefrontJson('/products.json?limit=10')) as {
    products?: Record<string, unknown>[]
  } | null
  for (const product of data?.products || []) {
    const src = imageSrcFromProduct(product)
    if (src) return src
  }
  return null
}

export async function fetchShopifyProductImage(opts: {
  productId?: string | number | null
  handle?: string | null
}): Promise<string | null> {
  if (opts.handle) {
    const byHandle = (await fetchStorefrontJson(
      `/products/${encodeURIComponent(opts.handle)}.js`,
    )) as Record<string, unknown> | null
    const fromHandle = imageSrcFromProduct(byHandle)
    if (fromHandle) return fromHandle

    const listed = (await fetchStorefrontJson(
      `/products.json?handle=${encodeURIComponent(opts.handle)}&limit=1`,
    )) as { products?: Record<string, unknown>[] } | null
    const fromList = imageSrcFromProduct(listed?.products?.[0])
    if (fromList) return fromList
  }

  try {
    if (opts.productId) {
      const id = shopifyNumericId(opts.productId, 'Product')
      if (id) {
        const data = await fetchShopify(`/products/${id}.json`)
        const src = imageSrcFromProduct(data?.product)
        if (src) return src
      }
    }
    if (opts.handle) {
      const data = await fetchShopify(
        `/products.json?handle=${encodeURIComponent(opts.handle)}&limit=1`,
      )
      const src = imageSrcFromProduct(data?.products?.[0])
      if (src) return src
    }
  } catch (err) {
    console.warn(
      '[shopify-product-image] Admin API lookup failed:',
      err instanceof Error ? err.message : err,
    )
  }
  return null
}

/** Persist image_url on each line item so later WhatsApp sends do not re-fetch. */
export async function withShopifyProductImages(
  lineItems: unknown,
): Promise<unknown> {
  if (!Array.isArray(lineItems)) return lineItems
  const out = []
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') {
      out.push(raw)
      continue
    }
    const item = { ...(raw as Record<string, unknown>) }
    const existing = pickImageFromItem(item)
    if (existing) {
      item.image_url = existing
      out.push(item)
      continue
    }
    const productId = shopifyNumericId(item.product_id, 'Product')
    const handle =
      typeof item.handle === 'string'
        ? item.handle
        : extractHandleFromProductUrl(item.url || item.product_url)
    const fetched = await fetchShopifyProductImage({ productId, handle })
    if (fetched) item.image_url = fetched
    out.push(item)
  }
  return out
}

/**
 * Header image for an image-template send: latest cart product, else
 * latest order product, else browse-abandon product, else any live
 * catalog product from the Shopify storefront.
 */
export async function resolveContactShopifyHeaderImage(
  db: SupabaseClient,
  contactId: string,
): Promise<string | null> {
  const { data: checkout } = await db
    .from('shopify_checkouts')
    .select('line_items')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let url = extractProductImageUrlFromLineItems(checkout?.line_items)
  if (url) return url

  const checkoutProductId = extractProductIdFromLineItems(checkout?.line_items)
  url = await fetchShopifyProductImage({ productId: checkoutProductId })
  if (url) return url

  const { data: order } = await db
    .from('shopify_orders')
    .select('line_items')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  url = extractProductImageUrlFromLineItems(order?.line_items)
  if (url) return url

  const orderProductId = extractProductIdFromLineItems(order?.line_items)
  url = await fetchShopifyProductImage({ productId: orderProductId })
  if (url) return url

  const { data: tracking } = await db
    .from('shopify_recovery_tracking')
    .select('metadata')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const meta = (tracking?.metadata || {}) as Record<string, unknown>
  const metaUrl = asHttpUrl(meta.image_url) || asHttpUrl(meta.product_image)
  if (metaUrl) return forMetaImageUrl(metaUrl)

  url = await fetchShopifyProductImage({
    productId: meta.product_id as string | number | undefined,
    handle: extractHandleFromProductUrl(meta.product_url),
  })
  if (url) return url

  return fetchShopifyCatalogHeaderImage()
}
