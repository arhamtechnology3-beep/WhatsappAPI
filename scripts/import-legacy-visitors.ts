/**
 * One-time copy of visitor_identity_map (+ optional sessions) from the
 * legacy VISITOR_TRACKING Supabase project into the main CRM DB.
 *
 * Usage:
 *   npx tsx scripts/import-legacy-visitors.ts --account <uuid> [--apply]
 *
 * Dry-run by default.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const accountIdx = args.indexOf('--account')
  const accountId = accountIdx >= 0 ? args[accountIdx + 1] : null

  if (!accountId) {
    console.error('Usage: npx tsx scripts/import-legacy-visitors.ts --account <uuid> [--apply]')
    process.exit(1)
  }

  const trackingUrl = process.env.VISITOR_TRACKING_SUPABASE_URL
  const trackingKey = process.env.VISITOR_TRACKING_SUPABASE_ANON_KEY
  const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const mainKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!trackingUrl || !trackingKey || !mainUrl || !mainKey) {
    console.error('Missing VISITOR_TRACKING_* or main Supabase env vars')
    process.exit(1)
  }

  const main = createClient(mainUrl, mainKey)
  const { data: store } = await main
    .from('stores')
    .select('id, organization_id')
    .eq('organization_id', accountId)
    .limit(1)
    .maybeSingle()

  if (!store) {
    console.error('No store for account', accountId)
    process.exit(1)
  }

  const idRes = await fetch(
    `${trackingUrl}/rest/v1/visitor_identity_map?select=visitor_id,phone_number,first_linked_at&limit=5000`,
    {
      headers: {
        apikey: trackingKey,
        Authorization: `Bearer ${trackingKey}`,
      },
    },
  )
  if (!idRes.ok) {
    console.error('Legacy identity fetch failed', await idRes.text())
    process.exit(1)
  }
  const rows: Array<{ visitor_id: string; phone_number: string; first_linked_at?: string }> =
    await idRes.json()

  console.log(`Found ${rows.length} legacy identity rows. apply=${apply}`)

  let linked = 0
  for (const row of rows) {
    if (!row.visitor_id || !row.phone_number) continue

    const { data: contact } = await main
      .from('contacts')
      .select('id, phone')
      .eq('account_id', accountId)
      .eq('phone', row.phone_number)
      .maybeSingle()

    if (!apply) {
      linked++
      continue
    }

    await main.from('visitor_identity_map').upsert(
      {
        visitor_id: row.visitor_id,
        phone_number: row.phone_number,
        store_id: store.id,
        organization_id: store.organization_id,
        contact_id: contact?.id ?? null,
        source: 'capture',
        linked_at: row.first_linked_at || new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'visitor_id,phone_number' },
    )
    linked++
  }

  console.log(apply ? `Upserted ${linked} rows` : `Would upsert ${linked} rows`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
