/** Shopify fulfillment as it appears in order and fulfillment webhook payloads. */
export type ShopifyFulfillmentLike = {
  status?: string | null
  shipment_status?: string | null
  tracking_number?: string | null
  tracking_numbers?: string[] | null
  tracking_url?: string | null
  tracking_urls?: string[] | null
  tracking_company?: string | null
  updated_at?: string | null
}

/** Courier scans older than this sync silently — no "delivered" message days late. */
export const DELIVERY_NOTIFY_FRESHNESS_MS = 24 * 60 * 60 * 1000

const DEAD_STATUSES = new Set(['cancelled', 'error', 'failure'])

/**
 * The fulfillment that currently carries the parcel. Re-booking a courier
 * cancels the old AWB, so the most recently updated live fulfillment wins.
 */
export function latestFulfillment(
  fulfillments: ShopifyFulfillmentLike[] | null | undefined,
): ShopifyFulfillmentLike | null {
  const live = (fulfillments || []).filter(
    (f) => !DEAD_STATUSES.has(String(f.status || '').toLowerCase()),
  )
  if (live.length === 0) return null
  return live.reduce((best, f) =>
    Date.parse(f.updated_at || '') > Date.parse(best.updated_at || '') ? f : best,
  )
}

export function fulfillmentTrackingNumber(f: ShopifyFulfillmentLike | null | undefined): string {
  return (f?.tracking_number || f?.tracking_numbers?.[0] || '').trim()
}

export function fulfillmentTrackingUrl(f: ShopifyFulfillmentLike | null | undefined): string {
  return (f?.tracking_url || f?.tracking_urls?.[0] || '').trim()
}

export function isDelivered(f: ShopifyFulfillmentLike | null | undefined): boolean {
  return String(f?.shipment_status || '').toLowerCase() === 'delivered'
}

/** Delivered recently enough that the customer should still get the WhatsApp. */
export function isFreshDelivery(
  f: ShopifyFulfillmentLike | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isDelivered(f)) return false
  const at = Date.parse(f?.updated_at || '')
  return Number.isFinite(at) && now.getTime() - at < DELIVERY_NOTIFY_FRESHNESS_MS
}
