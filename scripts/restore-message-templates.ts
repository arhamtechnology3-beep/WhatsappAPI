/**
 * Re-create missing message_templates rows from the templates on the
 * account's WABA (e.g. after a wipe). Existing rows are left alone.
 *
 *   npx tsx scripts/restore-message-templates.ts <accountId>          # dry run
 *   npx tsx scripts/restore-message-templates.ts <accountId> --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const accountId = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!accountId) throw new Error('usage: restore-message-templates.ts <accountId> [--apply]')

  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../src/lib/whatsapp/encryption')
  const { metaTemplateToRow } = await import('../src/lib/whatsapp/meta-template-row')
  const isMetaSample = (name: string) =>
    /^(hello_world$|sample_|jaspers_)|3p_direct_integration/i.test(name)
  type MetaTemplate = import('../src/lib/whatsapp/meta-template-row').MetaTemplate

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await db
    .from('whatsapp_config')
    .select('waba_id, access_token')
    .eq('account_id', accountId)
    .single()
  const { data: account } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .single()
  if (!cfg?.waba_id || !account?.owner_user_id) throw new Error('account has no WABA or owner')

  const token = decrypt(cfg.access_token)
  const templates: MetaTemplate[] = []
  let url: string | null =
    `https://graph.facebook.com/v21.0/${cfg.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const body = (await res.json()) as { data?: MetaTemplate[]; paging?: { next?: string }; error?: { message: string } }
    if (body.error) throw new Error(body.error.message)
    templates.push(...(body.data ?? []))
    url = body.paging?.next ?? null
  }

  const { data: existing } = await db
    .from('message_templates')
    .select('name, language')
    .eq('account_id', accountId)
  const have = new Set((existing ?? []).map((r) => `${r.name}::${r.language}`))

  let inserted = 0
  for (const t of templates) {
    if (isMetaSample(t.name) || have.has(`${t.name}::${t.language}`)) continue
    const row = metaTemplateToRow(t, { accountId, userId: account.owner_user_id })
    console.log(`${apply ? 'insert' : 'would insert'} ${t.name} (${t.language}) ${row.status}`)
    if (!apply) continue
    const { error } = await db.from('message_templates').insert(row)
    if (error) console.error(`  failed: ${error.message}`)
    else inserted++
  }
  console.log(apply ? `inserted ${inserted}` : 'dry run — pass --apply to write')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
