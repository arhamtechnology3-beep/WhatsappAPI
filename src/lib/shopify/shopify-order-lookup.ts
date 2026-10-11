import { fetchShopify } from '@/lib/shopify/shopify-client'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { fetchShiprocketShipment, type LiveShipment } from '@/lib/shiprocket/client'
import {
  STAGE_LABEL,
  formatDay,
  isPastExpectedDelivery,
  resolveOrderStage,
} from '@/lib/orders/order-stage'

export type ShopifyOrderLike = {
  id?: number | string
  name?: string | null
  order_number?: string | number | null
  financial_status?: string | null
  fulfillment_status?: string | null
  cancelled_at?: string | null
  total_price?: string | number | null
  currency?: string | null
  order_status_url?: string | null
  line_items?: Array<{
    title?: string
    name?: string
    variant_title?: string | null
    quantity?: number
  }>
  fulfillments?: Array<{
    tracking_url?: string | null
    tracking_number?: string | null
    tracking_company?: string | null
    shipment_status?: string | null
  }>
}

export function orderNumberCandidates(raw: string): string[] {
  const trimmed = (raw || '').trim()
  const digits = trimmed.replace(/\D/g, '')
  const out: string[] = []
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v)
  }
  if (trimmed) {
    push(trimmed)
    push(trimmed.replace(/^#/, ''))
  }
  if (digits) {
    push(digits)
    push(`#${digits}`)
  }
  return out
}

export function orderMatchesQuery(
  order: { name?: string | null; order_number?: string | number | null },
  query: string,
): boolean {
  const needles = orderNumberCandidates(query).map((n) => n.toLowerCase())
  if (needles.length === 0) return false
  const hay = [
    order.name,
    order.order_number != null ? String(order.order_number) : '',
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
  const hayDigits = hay.map((s) => s.replace(/\D/g, '')).filter(Boolean)
  const queryDigits = (query || '').replace(/\D/g, '')
  for (const n of needles) {
    if (hay.some((h) => h === n || h.endsWith(n) || h.includes(n))) return true
  }
  if (queryDigits.length >= 4 && hayDigits.some((h) => h.endsWith(queryDigits))) {
    return true
  }
  return false
}

function paymentLabel(raw?: string | null): string {
  const s = (raw || '').toLowerCase()
  if (s === 'paid') return 'Paid'
  if (s.startsWith('cod') || s === 'pending') return 'Cash on Delivery'
  if (s === 'refunded') return 'Refunded'
  if (s === 'partially_refunded') return 'Partially refunded'
  return ''
}

function primaryFulfillment(order: ShopifyOrderLike) {
  return (
    order.fulfillments?.find((f) => f.tracking_number) ||
    order.fulfillments?.[0] ||
    null
  )
}

export function trackingNumberOf(order: ShopifyOrderLike): string {
  return primaryFulfillment(order)?.tracking_number?.trim() || ''
}

export interface OrderStatusExtras {
  /** Live courier status from Shiprocket, when connected. */
  live?: LiveShipment | null
  /** Our shopify_orders.fulfillment_status (in_transit / delivered / ndr…). */
  localFulfillment?: string | null
  now?: Date
}

export function orderStageOf(order: ShopifyOrderLike, extras: OrderStatusExtras = {}) {
  const fulfillment = primaryFulfillment(order)
  const stage = resolveOrderStage({
    financialStatus: order.financial_status,
    fulfillmentStatus:
      extras.localFulfillment && extras.localFulfillment !== 'fulfilled'
        ? extras.localFulfillment
        : order.fulfillment_status,
    cancelledAt: order.cancelled_at,
    shipmentStatus: fulfillment?.shipment_status,
    live: extras.live,
  })
  const delayed = isPastExpectedDelivery(stage, extras.live?.edd, extras.now)
  return { stage, delayed }
}

export function formatOrderStatusMessage(
  order: ShopifyOrderLike,
  extras: OrderStatusExtras = {},
): string {
  const name =
    order.name?.trim() ||
    (order.order_number != null ? `#${order.order_number}` : 'aapka order')
  const live = extras.live
  const fulfillment = primaryFulfillment(order)
  const { stage, delayed } = orderStageOf(order, extras)

  const lines = [`Order ${name} ki details 👇`, '', `📦 Status: ${STAGE_LABEL[stage]}`]

  if (stage === 'delivered' && live?.deliveredAt) {
    lines.push(`🗓️ Delivered on: ${formatDay(live.deliveredAt)}`)
  }
  if (stage !== 'delivered' && stage !== 'cancelled') {
    if (live?.lastLocation && live.lastLocation !== 'NA' && stage !== 'packed') {
      const when = formatDay(live.lastActivityAt)
      lines.push(`📍 Last update: ${live.lastLocation}${when ? ` (${when})` : ''}`)
    }
    const courier = live?.courier || fulfillment?.tracking_company || ''
    if (courier) lines.push(`🚚 Courier: ${courier}`)
    if (live?.edd) lines.push(`🗓️ Expected delivery: ${formatDay(live.edd)}`)
  }
  if (delayed) {
    lines.push(
      '',
      '⚠️ Expected date nikal gayi hai — sorry for the delay 🙏 Hum courier se follow up kar rahe hain. Neeche "Talk to agent" dabayein, team turant help karegi.',
    )
  }

  const items = (order.line_items || [])
    .slice(0, 6)
    .map((li) => {
      const title = (li.title || li.name || 'Item').trim()
      const variant = (li.variant_title || '').trim()
      const label =
        variant && variant !== 'Default Title' && !title.includes(variant)
          ? `${title} (${variant})`
          : title
      return `• ${label} × ${Number(li.quantity) || 1}`
    })
    .join('\n')
  if (items) lines.push('', '🛍️ Items:', items)

  const total =
    order.total_price != null && String(order.total_price).length > 0
      ? `${order.currency === 'INR' || !order.currency ? '₹' : `${order.currency} `}${order.total_price}`
      : ''
  const pay = paymentLabel(order.financial_status)
  if (total) lines.push('', `💰 Total: ${total}${pay ? ` (${pay})` : ''}`)

  const tracking =
    live?.trackUrl ||
    fulfillment?.tracking_url ||
    order.fulfillments?.find((f) => f.tracking_url)?.tracking_url ||
    order.order_status_url ||
    ''
  if (tracking) lines.push(`🔗 Track: ${tracking}`)

  lines.push(
    '',
    'Sab theek hai to "All good" dabayein, koi concern ho to "Talk to agent".',
  )
  return lines.join('\n')
}

export function snapshotToVars(
  order: ShopifyOrderLike,
  extras: OrderStatusExtras = {},
): Record<string, string> {
  const { stage, delayed } = orderStageOf(order, extras)
  return {
    order_found: 'true',
    order_name: order.name || (order.order_number != null ? `#${order.order_number}` : ''),
    order_status: (order.financial_status || '').toLowerCase(),
    order_fulfillment: stage,
    order_delayed: delayed ? 'true' : 'false',
    order_total:
      order.total_price != null ? String(order.total_price) : '',
    order_summary: formatOrderStatusMessage(order, extras),
  }
}

async function fetchShopifyOrderByName(name: string): Promise<ShopifyOrderLike | null> {
  try {
    const res = await fetchShopify(
      `/orders.json?status=any&name=${encodeURIComponent(name)}&limit=5`,
    )
    const rows = (res.orders || []) as ShopifyOrderLike[]
    const hit = rows.find((o) => orderMatchesQuery(o, name)) || rows[0]
    return hit || null
  } catch (err) {
    console.warn('[shopify-order-lookup] REST name search failed:', name, err)
    return null
  }
}

async function fetchCustomerOrders(
  shopifyCustomerId: string,
): Promise<ShopifyOrderLike[]> {
  try {
    const res = await fetchShopify(
      `/customers/${shopifyCustomerId}/orders.json?status=any&limit=50`,
    )
    return (res.orders || []) as ShopifyOrderLike[]
  } catch (err) {
    console.warn('[shopify-order-lookup] customer orders failed:', err)
    return []
  }
}

/**
 * Resolve a customer-typed order id (1006, #1006, DP/26/1006) to a
 * Shopify Admin order, then Farm Didi copy for WhatsApp.
 */
export async function lookupShopifyOrderStatus(args: {
  query: string
  accountId: string
  contactId?: string | null
}): Promise<{ found: boolean; vars: Record<string, string> }> {
  const query = (args.query || '').trim()
  const empty = {
    found: false,
    vars: {
      order_found: 'false',
      order_summary:
        `Order ${query || 'number'} hamare Shopify records mein nahi mila. Number check karke dubara try karein, ya Talk to agent.`,
    },
  }
  if (!query) return empty

  const db = supabaseAdmin()
  const candidates = orderNumberCandidates(query)

  const withLiveTracking = async (
    order: ShopifyOrderLike,
    localFulfillment?: string | null,
    fallbackAwb?: string,
  ) => {
    const awb = trackingNumberOf(order) || fallbackAwb || ''
    const live = awb ? await fetchShiprocketShipment(db, args.accountId, awb) : null
    return { found: true, vars: snapshotToVars(order, { live, localFulfillment }) }
  }

  if (args.contactId) {
    const { data: local } = await db
      .from('shopify_orders')
      .select('order_number, financial_status, fulfillment_status, total_price, currency, line_items, tracking_url, shopify_order_id')
      .eq('contact_id', args.contactId)
      .limit(50)
    const match = (local || []).find((row) =>
      orderMatchesQuery(
        { name: row.order_number, order_number: row.order_number },
        query,
      ),
    )
    if (match?.shopify_order_id) {
      try {
        const live = await fetchShopify(`/orders/${match.shopify_order_id}.json`)
        if (live?.order) {
          return withLiveTracking(live.order as ShopifyOrderLike, match.fulfillment_status)
        }
      } catch (err) {
        console.warn('[shopify-order-lookup] live order fetch failed, using local row:', err)
      }
      return withLiveTracking(
        {
          name: match.order_number,
          order_number: match.order_number,
          financial_status: match.financial_status,
          fulfillment_status: match.fulfillment_status,
          total_price: match.total_price,
          currency: match.currency,
          line_items: match.line_items as ShopifyOrderLike['line_items'],
          order_status_url: match.tracking_url,
        },
        match.fulfillment_status,
        awbFromTrackingUrl(match.tracking_url),
      )
    }

    const { data: contact } = await db
      .from('contacts')
      .select('shopify_customer_id')
      .eq('id', args.contactId)
      .maybeSingle()
    if (contact?.shopify_customer_id) {
      const orders = await fetchCustomerOrders(String(contact.shopify_customer_id))
      const hit = orders.find((o) => orderMatchesQuery(o, query))
      if (hit) return withLiveTracking(hit)
    }
  }

  for (const name of candidates) {
    const hit = await fetchShopifyOrderByName(name)
    if (hit && orderMatchesQuery(hit, query)) {
      return withLiveTracking(hit)
    }
  }

  return empty
}

/** `https://store.shiprocket.co/tracking/SRSP5359042244` → `SRSP5359042244`. */
export function awbFromTrackingUrl(url: string | null | undefined): string {
  const m = (url || '').match(/\/tracking\/([A-Za-z0-9]+)/)
  return m ? m[1] : ''
}
