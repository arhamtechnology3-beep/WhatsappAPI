/**
 * Courier scan → customer WhatsApp milestone.
 *
 * Interakt / AiSensy / Wati send a short journey (confirmed → dispatched
 * → OFD → delivered) plus NDR recovery. Intermediate courier scans
 * (hub in, hub out) must not spam the customer.
 */

export type ShipmentMilestone =
  | 'in_transit'
  | 'ofd'
  | 'delivered'
  | 'ndr'
  | 'skip'

export type TrackingEvent = {
  awb: string
  status: string
  courier: string
  phone: string
  orderId: string
  channelOrderId: string
  customerName: string
  trackingUrl: string
  etd: string
  source: string
}

/** @deprecated use TrackingEvent */
export type ShiprocketTrackingEvent = TrackingEvent

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function nested(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(body[key]) || {}
}

export function parseShiprocketWebhook(body: unknown): TrackingEvent {
  const root = asRecord(body) || {}
  const data = nested(root, 'data')
  const tracking = nested(root, 'tracking_data')
  const shipment = nested(root, 'shipment')

  const awb = firstString(
    root.awb,
    root.awb_code,
    root.awb_number,
    data.awb,
    tracking.awb,
    shipment.awb,
  )
  const status = firstString(
    root.current_status,
    root.status,
    root.shipment_status,
    data.current_status,
    data.status,
    tracking.shipment_status,
    shipment.status,
  )
  const courier = firstString(
    root.courier_name,
    root.courier,
    data.courier_name,
    tracking.courier_name,
    shipment.courier,
  )
  const phone = firstString(
    root.customer_phone,
    root.phone,
    root.delivery_phone,
    data.customer_phone,
    data.phone,
    shipment.phone,
  )
  const orderId = firstString(
    root.sr_order_id,
    root.order_id,
    data.order_id,
    shipment.order_id,
  )
  const channelOrderId = firstString(
    root.channel_order_id,
    root.channel_order,
    data.channel_order_id,
    shipment.channel_order_id,
  )
  const customerName = firstString(
    root.customer_name,
    data.customer_name,
    shipment.customer_name,
  )
  const etd = firstString(root.etd, root.edd, data.etd, tracking.etd)
  const trackingUrl = firstString(
    root.track_url,
    root.tracking_url,
    data.tracking_url,
    awb ? `https://shiprocket.co/tracking/${awb}` : '',
  )

  return {
    awb,
    status,
    courier: courier || 'Shiprocket',
    phone,
    orderId,
    channelOrderId,
    customerName,
    trackingUrl,
    etd,
    source: 'shiprocket',
  }
}

/** Strip Shopify # / GID noise so "1011" matches shopify_orders.order_number. */
export function normalizeChannelOrderId(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const gid = s.match(/Order\/(\d+)/i)
  if (gid) return gid[1]
  return s.replace(/^#/, '').trim()
}

export function mapShipmentStatus(status: string): ShipmentMilestone {
  const s = status.toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (!s) return 'skip'

  if (
    /\b(rto|return to origin|lost|destroyed|cancelled|canceled)\b/.test(s)
  ) {
    return 'skip'
  }

  if (
    /\b(undelivered|un delivered|ndr|failed delivery|delivery failed|eod ndr|attemptfail|attempt fail|exception)\b/.test(
      s,
    )
  ) {
    return 'ndr'
  }

  if (/\b(delivered|delivery completed)\b/.test(s) && !/\bundelivered\b/.test(s)) {
    return 'delivered'
  }

  if (/\b(out for delivery|ofd|outfordelivery|dispatched to pod)\b/.test(s)) {
    return 'ofd'
  }

  if (
    /\b(picked up|pickedup|shipped|in transit|intransit|dispatched|connected)\b/.test(s)
  ) {
    return 'in_transit'
  }

  return 'skip'
}

/** @deprecated use mapShipmentStatus */
export const mapShiprocketStatus = mapShipmentStatus

export function ndrIdempotencyBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function shipmentNotifyTrigger(
  milestone: Exclude<ShipmentMilestone, 'skip'>,
): 'shipment_in_transit' | 'shipment_ofd' | 'order_delivered' | 'shipment_ndr' {
  if (milestone === 'in_transit') return 'shipment_in_transit'
  if (milestone === 'ofd') return 'shipment_ofd'
  if (milestone === 'delivered') return 'order_delivered'
  return 'shipment_ndr'
}
