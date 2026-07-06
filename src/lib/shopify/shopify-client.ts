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

export async function fetchShopify(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_ADMIN_API_TOKEN
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01'

  if (!storeDomain || !accessToken) {
    throw new Error('Shopify environment variables SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_TOKEN are not configured.')
  }

  // Clean the domain to prevent formatting issues
  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const url = `https://${cleanDomain}/admin/api/${apiVersion}/${path.replace(/^\//, '')}`

  const headers = new Headers(options.headers)
  headers.set('X-Shopify-Access-Token', accessToken)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  console.log(`[shopify-client] Requesting URL: ${url}`)
  console.log(`[shopify-client] Method: ${options.method || 'GET'}`)
  console.log(`[shopify-client] Headers:`, Object.fromEntries(headers.entries()))
  if (options.body) {
    console.log(`[shopify-client] Body Length: ${options.body.toString().length}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  console.log(`[shopify-client] Response Status: ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[shopify-client] error response from ${url}:`, errorText)
    throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return response.json()
}

/**
 * Test the connection by fetching shop details.
 */
export async function getShopInfo(): Promise<ShopifyShopInfo> {
  const data = await fetchShopify('/shop.json')
  return data.shop as ShopifyShopInfo
}
