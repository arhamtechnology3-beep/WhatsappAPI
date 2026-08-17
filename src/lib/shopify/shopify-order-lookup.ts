import { fetchShopify } from '@/lib/shopify/shopify-client'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export type ShopifyOrderLike = {
  id?: number | string
  name?: string | null
  order_number?: string | number | null
  financial_status?: string | null
  fulfillment_status?: string | null
  total_price?: string | number | null
  currency?: string | null
  order_status_url?: string | null
  line_items?: Array<{ title?: string; name?: string; quantity?: number }>
  fulfillments?: Array<{
    tracking_url?: string | null
    tracking_number?: string | null
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

function humanStatus(raw?: string | null, fallback = 'updating'): string {
  const s = (raw || '').trim().toLowerCase().replace(/_/g, ' ')
  return s || fallback
}

export function formatOrderStatusMessage(order: ShopifyOrderLike): string {
  const name =
    order.name?.trim() ||
    (order.order_number != null ? `#${order.order_number}` : 'your order')
  const pay = humanStatus(order.financial_status, 'pending')
  const ship = humanStatus(order.fulfillment_status, 'not shipped yet')
  const items = (order.line_items || [])
    .slice(0, 6)
    .map((li) => {
      const title = (li.title || li.name || 'Item').trim()
      const qty = Number(li.quantity) || 1
      return `• ${title} × ${qty}`
    })
    .join('\n')
  const total =
    order.total_price != null && String(order.total_price).length > 0
      ? `${order.currency === 'INR' || !order.currency ? '₹' : `${order.currency} `}${order.total_price}`
      : ''
  const tracking =
    order.fulfillments?.find((f) => f.tracking_url)?.tracking_url ||
    order.fulfillments?.find((f) => f.tracking_number)?.tracking_number ||
    order.order_status_url ||
    ''

  const lines = [
    `Order ${name} mil gaya ✅`,
    ``,
    `Payment: ${pay}`,
    `Delivery: ${ship}`,
  ]
  if (items) {
    lines.push('', 'Items:', items)
  }
  if (total) lines.push('', `Total: ${total}`)
  if (tracking) lines.push(`Track: ${tracking}`)
  lines.push(
    '',
    'Sab theek hai to All good dabayein. Koi concern ho to Talk to agent.',
  )
  return lines.join('\n')
}

export function snapshotToVars(order: ShopifyOrderLike): Record<string, string> {
  return {
    order_found: 'true',
    order_name: order.name || (order.order_number != null ? `#${order.order_number}` : ''),
    order_status: humanStatus(order.financial_status, ''),
    order_fulfillment: humanStatus(order.fulfillment_status, 'not shipped yet'),
    order_total:
      order.total_price != null ? String(order.total_price) : '',
    order_summary: formatOrderStatusMessage(order),
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
          return { found: true, vars: snapshotToVars(live.order as ShopifyOrderLike) }
        }
      } catch (err) {
        console.warn('[shopify-order-lookup] live order fetch failed, using local row:', err)
      }
      return {
        found: true,
        vars: snapshotToVars({
          name: match.order_number,
          order_number: match.order_number,
          financial_status: match.financial_status,
          fulfillment_status: match.fulfillment_status,
          total_price: match.total_price,
          currency: match.currency,
          line_items: match.line_items as ShopifyOrderLike['line_items'],
          order_status_url: match.tracking_url,
        }),
      }
    }

    const { data: contact } = await db
      .from('contacts')
      .select('shopify_customer_id')
      .eq('id', args.contactId)
      .maybeSingle()
    if (contact?.shopify_customer_id) {
      const orders = await fetchCustomerOrders(String(contact.shopify_customer_id))
      const hit = orders.find((o) => orderMatchesQuery(o, query))
      if (hit) return { found: true, vars: snapshotToVars(hit) }
    }
  }

  for (const name of candidates) {
    const hit = await fetchShopifyOrderByName(name)
    if (hit && orderMatchesQuery(hit, query)) {
      return { found: true, vars: snapshotToVars(hit) }
    }
  }

  return empty
}
