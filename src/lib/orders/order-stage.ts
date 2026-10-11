import type { LiveShipment } from '@/lib/shiprocket/client'
import { mapShipmentStatus } from '@/lib/shiprocket/status'

/** What the customer should be told, independent of Shopify / courier wording. */
export type OrderStage =
  | 'cancelled'
  | 'confirmed'
  | 'packed'
  | 'in_transit'
  | 'ofd'
  | 'ndr'
  | 'delivered'
  | 'rto'

export interface OrderStageInput {
  financialStatus?: string | null
  /** Shopify order.fulfillment_status or our local shopify_orders value (in_transit, delivered…). */
  fulfillmentStatus?: string | null
  cancelledAt?: string | null
  /** Shopify fulfillment.shipment_status (in_transit, out_for_delivery, delivered, failure…). */
  shipmentStatus?: string | null
  live?: Pick<LiveShipment, 'status' | 'edd'> | null
}

/** Courier wording → stage. Hub scans ("Reached at destination hub") are still in transit. */
export function stageFromCourierStatus(raw: string): OrderStage | null {
  const s = raw.toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (!s) return null
  if (/\b(rto|return to origin|returned to origin|rto delivered)\b/.test(s)) return 'rto'
  const milestone = mapShipmentStatus(s)
  if (milestone === 'delivered') return 'delivered'
  if (milestone === 'ofd') return 'ofd'
  if (milestone === 'ndr' || /\bdelivery attempt/.test(s)) return 'ndr'
  if (/\b(cancel+ed)\b/.test(s)) return null
  if (
    /\b(pickup (generated|scheduled|queued|pending|rescheduled)|manifest|ready ?for ?receive|label|awb assigned|new|confirmed|ready for pickup)\b/.test(
      s,
    ) &&
    !/\bpicked\b/.test(s)
  ) {
    return 'packed'
  }
  return 'in_transit'
}

function stageFromShopifyShipment(raw: string | null | undefined): OrderStage | null {
  switch ((raw || '').toLowerCase()) {
    case 'delivered':
      return 'delivered'
    case 'out_for_delivery':
      return 'ofd'
    case 'attempted_delivery':
    case 'failure':
      return 'ndr'
    case 'in_transit':
    case 'picked_up':
      return 'in_transit'
    case 'confirmed':
    case 'label_printed':
    case 'label_purchased':
    case 'ready_for_pickup':
      return 'packed'
    default:
      return null
  }
}

export function resolveOrderStage(input: OrderStageInput): OrderStage {
  const financial = (input.financialStatus || '').toLowerCase()
  if (input.cancelledAt || financial === 'voided') return 'cancelled'

  const fromLive = input.live?.status ? stageFromCourierStatus(input.live.status) : null
  if (fromLive) return fromLive

  const fromShipment = stageFromShopifyShipment(input.shipmentStatus)
  if (fromShipment) return fromShipment

  switch ((input.fulfillmentStatus || '').toLowerCase()) {
    case 'delivered':
      return 'delivered'
    case 'out_for_delivery':
      return 'ofd'
    case 'ndr':
      return 'ndr'
    case 'in_transit':
    case 'fulfilled':
    case 'partial':
      return 'in_transit'
    default:
      return 'confirmed'
  }
}

/** "2026-10-10 00:00:00" → Date at that calendar day (IST-agnostic). */
function parseDay(raw: string | null | undefined): Date | null {
  const m = (raw || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function formatDay(raw: string | null | undefined): string {
  const d = parseDay(raw)
  if (!d) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Not delivered and the courier's expected date is already behind us (IST). */
export function isPastExpectedDelivery(
  stage: OrderStage,
  edd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!['packed', 'in_transit', 'ndr'].includes(stage)) return false
  const due = parseDay(edd)
  if (!due) return false
  const istToday = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const today = Date.UTC(istToday.getUTCFullYear(), istToday.getUTCMonth(), istToday.getUTCDate())
  return today > due.getTime()
}

export const STAGE_LABEL: Record<OrderStage, string> = {
  cancelled: 'Cancelled ❌',
  confirmed: 'Confirmed ✅ — packing chal rahi hai',
  packed: 'Packed 📦 — courier pickup hone wala hai',
  in_transit: 'Raste mein hai 🚚 (abhi deliver nahi hua)',
  ofd: 'Aaj delivery ke liye nikla hai 🛵',
  ndr: 'Delivery attempt fail hua ⚠️ — courier dobara try karega',
  delivered: 'Deliver ho gaya ✅',
  rto: 'Parcel wapas hamare paas aa raha hai ↩️ — team aapse contact karegi',
}
