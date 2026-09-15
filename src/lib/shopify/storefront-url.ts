/** Public storefront customers should see — never the *.myshopify.com admin host. */
export const CUSTOMER_STOREFRONT_ORIGIN = 'https://divyaprabhafoods.com'

export function customerStoreName(): string {
  return 'DivyaPrabha Foods'
}

/**
 * Rewrite a Shopify checkout/product/cart URL (or a bare myshopify host)
 * to the custom domain. Non-store URLs (tracking carriers, etc.) are
 * left unchanged except for an explicit myshopify host swap.
 */
export function toCustomerStoreUrl(
  raw?: string | null,
  fallback: string = `${CUSTOMER_STOREFRONT_ORIGIN}/`,
): string {
  if (!raw || !raw.trim()) return fallback
  let s = raw.trim()
  s = s.replace(
    /https?:\/\/(www\.)?[^/\s]*myshopify\.com/gi,
    CUSTOMER_STOREFRONT_ORIGIN,
  )
  s = s.replace(/\b[a-z0-9-]+\.myshopify\.com\b/gi, 'divyaprabhafoods.com')
  if (/^divyaprabhafoods\.com\/?$/i.test(s)) {
    return `${CUSTOMER_STOREFRONT_ORIGIN}/`
  }
  if (s.startsWith('divyaprabhafoods.com/')) {
    return `https://${s}`
  }
  return s
}

export function toCustomerStoreName(raw?: string | null): string {
  if (!raw || !raw.trim()) return customerStoreName()
  if (/myshopify\.com/i.test(raw) || /divyaprabhafoods\.com/i.test(raw)) {
    return customerStoreName()
  }
  return raw.trim()
}
