/**
 * Submit the store-owner "new order" UTILITY template to Meta and save
 * it in message_templates. Alerts start once Meta approves it (the
 * template status webhook flips the row to APPROVED).
 *
 *   npx tsx scripts/submit-owner-order-template.ts <accountId>
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const accountId = process.argv[2]
  if (!accountId) throw new Error('usage: submit-owner-order-template.ts <accountId>')

  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../src/lib/whatsapp/encryption')
  const { submitMessageTemplate } = await import('../src/lib/whatsapp/meta-api')
  const { OWNER_ORDER_TEMPLATE, OWNER_ORDER_TEMPLATE_BODY, OWNER_ORDER_TEMPLATE_SAMPLE } =
    await import('../src/lib/shopify/owner-order-alert')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: existing } = await db
    .from('message_templates')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('name', OWNER_ORDER_TEMPLATE)
    .maybeSingle()
  if (existing) {
    console.log(`${OWNER_ORDER_TEMPLATE} already saved (${existing.status}); nothing to do`)
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

  const result = await submitMessageTemplate({
    wabaId: cfg.waba_id,
    accessToken: decrypt(cfg.access_token),
    payload: {
      name: OWNER_ORDER_TEMPLATE,
      category: 'UTILITY',
      language: 'en_US',
      components: [
        {
          type: 'BODY',
          text: OWNER_ORDER_TEMPLATE_BODY,
          example: { body_text: [OWNER_ORDER_TEMPLATE_SAMPLE] },
        },
      ],
    } as Parameters<typeof submitMessageTemplate>[0]['payload'],
  })
  console.log('Meta:', result)

  const { error } = await db.from('message_templates').insert({
    account_id: accountId,
    user_id: account.owner_user_id,
    name: OWNER_ORDER_TEMPLATE,
    category: 'Utility',
    language: 'en_US',
    body_text: OWNER_ORDER_TEMPLATE_BODY,
    sample_values: { body: OWNER_ORDER_TEMPLATE_SAMPLE },
    status: String(result.status || 'PENDING').toUpperCase(),
    meta_template_id: result.id,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  console.log(`saved ${OWNER_ORDER_TEMPLATE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
