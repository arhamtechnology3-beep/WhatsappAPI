/**
 * Shopify delivers some topics twice: once from the app's own config
 * (not listed by the Admin API) and once from the shop-level subscriptions
 * created by scripts/register-shopify-webhooks.ts. This deletes the
 * shop-level copy, but only for topics whose recent deliveries in
 * shopify_webhook_logs are actually doubled — so every topic keeps one
 * subscription.
 *
 * Dry run (default):  npx -y tsx --env-file=.env.local scripts/remove-duplicate-shopify-webhooks.ts
 * Delete:             npx -y tsx --env-file=.env.local scripts/remove-duplicate-shopify-webhooks.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { fetchShopify } from '../src/lib/shopify/shopify-client'

const APPLY = process.argv.includes('--apply')
const LOOKBACK_DAYS = 10

type Subscription = { id: number; topic: string; address: string; created_at: string }

async function doubledTopics(): Promise<Map<string, { events: number; doubled: number }>> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from('shopify_webhook_logs')
    .select('topic, payload->>id, payload->>updated_at')
    .gte('created_at', since)
    .limit(5000)
  if (error) throw new Error(`shopify_webhook_logs: ${error.message}`)

  const deliveries = new Map<string, number>()
  for (const row of (data || []) as Array<Record<string, string | null>>) {
    const key = `${row.topic}|${row.id}|${row.updated_at || ''}`
    deliveries.set(key, (deliveries.get(key) || 0) + 1)
  }

  const byTopic = new Map<string, { events: number; doubled: number }>()
  for (const [key, count] of deliveries) {
    const topic = key.split('|')[0]
    const stats = byTopic.get(topic) || { events: 0, doubled: 0 }
    stats.events++
    if (count > 1) stats.doubled++
    byTopic.set(topic, stats)
  }
  return byTopic
}

async function run() {
  if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_ADMIN_API_TOKEN) {
    console.error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set.')
    process.exit(1)
  }

  const stats = await doubledTopics()
  const { webhooks } = (await fetchShopify('/webhooks.json?limit=250')) as { webhooks: Subscription[] }

  console.log(`Shop-level subscriptions (${webhooks.length}):`)
  const toDelete: Subscription[] = []
  for (const hook of webhooks) {
    const s = stats.get(hook.topic)
    const alwaysDoubled = Boolean(s && s.events >= 2 && s.doubled === s.events)
    console.log(
      `  ${alwaysDoubled ? 'DELETE' : 'keep  '} #${hook.id} ${hook.topic.padEnd(22)} ${hook.address}` +
        `  (last ${LOOKBACK_DAYS}d: ${s ? `${s.doubled}/${s.events} events doubled` : 'no deliveries'})`,
    )
    if (alwaysDoubled) toDelete.push(hook)
  }

  if (!APPLY) {
    console.log(`\nDry run — ${toDelete.length} would be deleted. Re-run with --apply to delete.`)
    return
  }

  for (const hook of toDelete) {
    await fetchShopify(`/webhooks/${hook.id}.json`, { method: 'DELETE' })
    console.log(`Deleted #${hook.id} ${hook.topic}`)
  }
  console.log(`\nDone — deleted ${toDelete.length}. Do not re-run register-shopify-webhooks.ts.`)
}

run().catch((err) => {
  console.error('Unhandled script error:', err)
  process.exit(1)
})
