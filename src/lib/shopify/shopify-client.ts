export interface ShopifyShopInfo {
  id: number
  name: string
  email: string
  domain: string
  province: string
  country: string
  currency: string
  shop_owner: string
  myshopify_domain: string
}

export interface ShopifyCollectionPage<T = unknown> {
  items: T[]
  pages: number
  truncated: boolean
}

function shopifyCredentials() {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_ADMIN_API_TOKEN
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01'

  if (!storeDomain || !accessToken) {
    throw new Error('Shopify environment variables SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_TOKEN are not configured.')
  }

  let cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (cleanDomain === 'divyaprabhafoods.com' || cleanDomain === 'www.divyaprabhafoods.com') {
    cleanDomain = 'divyaprabhafoods.myshopify.com'
  }

  return { cleanDomain, accessToken, apiVersion }
}

export function buildShopifyAdminUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  const { cleanDomain, apiVersion } = shopifyCredentials()
  return `https://${cleanDomain}/admin/api/${apiVersion}/${pathOrUrl.replace(/^\//, '')}`
}

/**
 * Shopify REST pagination uses a comma-separated Link header, e.g.
 * `<https://shop.myshopify.com/admin/api/2025-01/customers.json?page_info=abc&limit=250>; rel="next"`
 */
export function parseShopifyLinkRelNext(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null
  const parts = linkHeader.split(',')
  for (const part of parts) {
    if (!/rel\s*=\s*"?next"?/i.test(part)) continue
    const match = part.match(/<([^>]+)>/)
    if (match?.[1]) return match[1]
  }
  return null
}

export async function fetchShopifyResponse(
  pathOrUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const { accessToken } = shopifyCredentials()
  const url = buildShopifyAdminUrl(pathOrUrl)

  const headers = new Headers(options.headers)
  headers.set('X-Shopify-Access-Token', accessToken)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  console.log(`[shopify-client] Requesting URL: ${url}`)
  console.log(`[shopify-client] Method: ${options.method || 'GET'}`)

  const response = await fetch(url, {
    ...options,
    headers,
  })

  console.log(`[shopify-client] Response Status: ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[shopify-client] error response from ${url}:`, errorText)
    throw new Error(`Shopify API error: ${response.status} ${response.statusText} - URL: ${url} - Error: ${errorText}`)
  }

  return response
}

export async function fetchShopify(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const response = await fetchShopifyResponse(path, options)
  return response.json()
}

/**
 * Follow Shopify Link `rel=next` pages until `maxPages` or the last page.
 * Pass `order=updated_at+desc` on the first request so newest records come first;
 * later pages only include `page_info` (Shopify forbids mixing `order` with it).
 */
export async function fetchShopifyCollection<T = unknown>(
  initialPath: string,
  collectionKey: string,
  options?: { maxPages?: number }
): Promise<ShopifyCollectionPage<T>> {
  const maxPages = options?.maxPages ?? 8
  const items: T[] = []
  let next: string | null = initialPath
  let pages = 0

  while (next && pages < maxPages) {
    const response = await fetchShopifyResponse(next)
    const json = await response.json()
    const pageItems = json?.[collectionKey]
    if (Array.isArray(pageItems)) {
      items.push(...pageItems)
    }
    next = parseShopifyLinkRelNext(response.headers.get('link'))
    pages++
  }

  return { items, pages, truncated: Boolean(next) }
}

/**
 * Test the connection by fetching shop details.
 */
export async function getShopInfo(): Promise<ShopifyShopInfo> {
  const data = await fetchShopify('/shop.json')
  return data.shop as ShopifyShopInfo
}
