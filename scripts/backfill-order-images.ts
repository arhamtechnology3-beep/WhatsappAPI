import { createClient } from '@supabase/supabase-js'
import {
  extractProductImageUrlFromLineItems,
  withShopifyProductImages,
} from '../src/lib/shopify/product-image'

// Usage: node --env-file=.env.local node_modules/.bin/tsx scripts/backfill-order-images.ts [days=60] [--dry-run]
const days = Number(process.argv.find((a) => /^\d+$/.test(a)) || 60)
const dryRun = process.argv.includes('--dry-run')

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }
  const db = createClient(url, key)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data: orders, error } = await db
    .from('shopify_orders')
    .select('id, order_number, line_items')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw error

  let fixed = 0
  let missing = 0
  for (const order of orders || []) {
    const items = Array.isArray(order.line_items) ? order.line_items : []
    const allHaveImages = items.every((li) =>
      extractProductImageUrlFromLineItems([li]),
    )
    if (allHaveImages) continue

    const enriched = await withShopifyProductImages(items)
    const stillMissing = (enriched as unknown[]).filter(
      (li) => !extractProductImageUrlFromLineItems([li]),
    ).length
    console.log(
      `#${order.order_number}: ${items.length - stillMissing}/${items.length} items with image`,
    )
    if (stillMissing > 0) missing++
    if (!dryRun) {
      await db.from('shopify_orders').update({ line_items: enriched }).eq('id', order.id)
    }
    fixed++
  }
  console.log(
    `${dryRun ? '[dry-run] ' : ''}updated ${fixed} orders; ${missing} still have items without an image`,
  )
}

run().catch((err) => {
  console.error('Unhandled script error:', err)
  process.exit(1)
})
