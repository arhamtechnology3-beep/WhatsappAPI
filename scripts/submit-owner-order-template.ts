/**
 * Submit the store-owner "new order" UTILITY template to Meta and save
 * it in message_templates. Alerts start once Meta approves it (the
 * template status webhook / 15-min sync flips the row to APPROVED).
 *
 *   npx tsx scripts/submit-owner-order-template.ts <accountId> [v1|v2]   (default v2)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const accountId = process.argv[2]
  const version = process.argv[3] || 'v2'
  if (!accountId || !['v1', 'v2'].includes(version)) {
    throw new Error('usage: submit-owner-order-template.ts <accountId> [v1|v2]')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../src/lib/whatsapp/encryption')
  const { submitMessageTemplate } = await import('../src/lib/whatsapp/meta-api')
  type MetaComponent = import('../src/lib/whatsapp/template-components').MetaComponent
  const alert = await import('../src/lib/shopify/owner-order-alert')
  const template =
    version === 'v2'
      ? {
          name: alert.OWNER_ORDER_TEMPLATE_V2,
          body: alert.OWNER_ORDER_TEMPLATE_V2_BODY,
          sample: alert.OWNER_ORDER_TEMPLATE_V2_SAMPLE,
          footer: alert.OWNER_ORDER_TEMPLATE_V2_FOOTER as string | null,
        }
      : {
          name: alert.OWNER_ORDER_TEMPLATE,
          body: alert.OWNER_ORDER_TEMPLATE_BODY,
          sample: alert.OWNER_ORDER_TEMPLATE_SAMPLE,
          footer: null,
        }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: existing } = await db
    .from('message_templates')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('name', template.name)
    .maybeSingle()
  if (existing) {
    console.log(`${template.name} already saved (${existing.status}); nothing to do`)
    return
  }

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

  const components: MetaComponent[] = [
    { type: 'BODY', text: template.body, example: { body_text: [template.sample] } },
  ]
  if (template.footer) components.push({ type: 'FOOTER', text: template.footer })

  const result = await submitMessageTemplate({
    wabaId: cfg.waba_id,
    accessToken: decrypt(cfg.access_token),
    payload: {
      name: template.name,
      category: 'UTILITY',
      language: 'en_US',
      components,
    } as Parameters<typeof submitMessageTemplate>[0]['payload'],
  })
  console.log('Meta:', result)

  const { error } = await db.from('message_templates').insert({
    account_id: accountId,
    user_id: account.owner_user_id,
    name: template.name,
    category: 'Utility',
    language: 'en_US',
    body_text: template.body,
    footer_text: template.footer,
    sample_values: { body: template.sample },
    status: String(result.status || 'PENDING').toUpperCase(),
    meta_template_id: result.id,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  console.log(`saved ${template.name}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
