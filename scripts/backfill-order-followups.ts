/**
 * Start review / refill follow-ups for orders delivered in the last 45 days
 * (deliveries before migration 058, or missed by the hooks). Dry run unless
 * --apply. Delivered time comes from the Shopify fulfillment.
 *
 *   npx tsx scripts/backfill-order-followups.ts [--apply]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const apply = process.argv.includes('--apply')
  const { createClient } = await import('@supabase/supabase-js')
  const { fetchShopify } = await import('../src/lib/shopify/shopify-client')
  const { latestFulfillment, isDelivered } = await import('../src/lib/shopify/fulfillment-tracking')
  const { scheduleOrderFollowups, resolveFollowupProducts } = await import(
    '../src/lib/followups/order-followups'
  )
  const { initialPlan, reviewableProducts } = await import('../src/lib/followups/plan')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data: orders, error } = await db
    .from('shopify_orders')
    .select('account_id, shopify_order_id, order_number, line_items, fulfillment_status, financial_status, updated_at')
    .in('fulfillment_status', ['delivered', 'fulfilled'])
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  if (error) throw error

  const now = new Date()
  for (const order of orders || []) {
    let deliveredAt: Date | null = null
    try {
      const res = await fetchShopify(`/orders/${order.shopify_order_id}.json`)
      const fulfillment = latestFulfillment(res?.order?.fulfillments)
      if (isDelivered(fulfillment)) deliveredAt = new Date(fulfillment!.updated_at!)
    } catch {
      // fall through to the local status
    }
    if (!deliveredAt && order.fulfillment_status === 'delivered') {
      deliveredAt = new Date(order.updated_at)
    }
    if (!deliveredAt) {
      console.log(`#${order.order_number}: not delivered, skip`)
      continue
    }

    const products = await resolveFollowupProducts(order.line_items)
    const plan = initialPlan(deliveredAt, now, reviewableProducts(products).length > 0)
    const summary = `#${order.order_number} delivered ${deliveredAt.toISOString()} → ${
      plan ? `${plan.stage} at ${plan.next_run_at?.toISOString()}` : 'too old'
    } [${products.map((p) => `${p.title}${p.handle ? '' : ' (no review page)'}`).join(', ')}]`
    if (!apply) {
      console.log(`dry-run ${summary}`)
      continue
    }
    const res = await scheduleOrderFollowups(db, {
      accountId: order.account_id,
      shopifyOrderId: order.shopify_order_id,
      deliveredAt,
      now,
    })
    console.log(`${res.status}${res.reason ? ` (${res.reason})` : ''} ${summary}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
