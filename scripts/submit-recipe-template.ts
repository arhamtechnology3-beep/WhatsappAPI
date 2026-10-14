/**
 * Submit one built-in Shopify recipe (image header, buttons) to Meta and
 * save it in message_templates. Sends that gate on APPROVED switch over
 * once Meta approves it.
 *
 *   npx tsx scripts/submit-recipe-template.ts <accountId> <templateName>
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const [accountId, templateName] = process.argv.slice(2)
  if (!accountId || !templateName) {
    throw new Error('usage: submit-recipe-template.ts <accountId> <templateName>')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../src/lib/whatsapp/encryption')
  const { submitMessageTemplate } = await import('../src/lib/whatsapp/meta-api')
  const { buildMetaTemplatePayload } = await import('../src/lib/whatsapp/template-components')
  const { ensureImageHeaderHandle } = await import('../src/lib/whatsapp/template-header-handle')
  const { normalizeStatus } = await import('../src/lib/whatsapp/template-status-normalize')
  const { recipeByName, recipeToDraftInsert, assertRecipeMetaSafe } = await import(
    '../src/lib/shopify/whatsapp-template-library'
  )

  const recipe = recipeByName(templateName)
  if (!recipe || recipe.template_name !== templateName) {
    throw new Error(`${templateName} is not a built-in recipe`)
  }
  assertRecipeMetaSafe(recipe)

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: existing } = await db
    .from('message_templates')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('name', templateName)
    .maybeSingle()
  if (existing && existing.status !== 'DRAFT') {
    console.log(`${templateName} already saved (${existing.status}); nothing to do`)
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
  const accessToken = decrypt(cfg.access_token)

  const row = recipeToDraftInsert(recipe, accountId, account.owner_user_id)
  const payload = {
    name: recipe.template_name,
    category: row.category as 'Marketing' | 'Utility',
    language: recipe.language,
    header_type: recipe.header_type,
    header_media_url: row.header_media_url as string,
    body_text: recipe.body,
    footer_text: recipe.footer_text,
    buttons: recipe.buttons,
    sample_values: recipe.sample_values,
  } as Parameters<typeof buildMetaTemplatePayload>[0]
  await ensureImageHeaderHandle(payload, accessToken)

  const result = await submitMessageTemplate({
    wabaId: cfg.waba_id,
    accessToken,
    payload: buildMetaTemplatePayload(payload),
  })
  console.log('Meta:', result)

  const saved = {
    ...row,
    header_handle: payload.header_handle ?? null,
    status: normalizeStatus(String(result.status || 'PENDING')),
    meta_template_id: result.id,
    last_submitted_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await db.from('message_templates').update(saved).eq('id', existing.id)
    : await db.from('message_templates').insert(saved)
  if (error) throw error
  console.log(`saved ${templateName} (${saved.status})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
