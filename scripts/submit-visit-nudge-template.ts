/**
 * Submit wacrm_visit_nudge_v1 to Meta for the given account.
 *
 *   npx tsx scripts/submit-visit-nudge-template.ts <accountId>
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { recipeByName, recipeToDraftInsert } from '@/lib/shopify/whatsapp-template-library'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { MetaComponent } from '@/lib/whatsapp/template-components'

config({ path: '.env.local' })

async function main() {
  const accountId = process.argv[2]
  if (!accountId) {
    console.error('Usage: npx tsx scripts/submit-visit-nudge-template.ts <accountId>')
    process.exit(1)
  }

  const recipe = recipeByName('wacrm_visit_nudge_v1')
  if (!recipe) throw new Error('Recipe missing')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: account } = await supabase
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle()
  const userId = account?.owner_user_id || accountId

  const draft = recipeToDraftInsert(recipe, accountId, userId)
  const { data: row, error } = await supabase
    .from('message_templates')
    .upsert(draft, { onConflict: 'account_id,name,language' })
    .select('*')
    .maybeSingle()

  if (error) throw error
  console.log('Saved draft', row?.id, row?.name)

  const { data: cfg } = await supabase
    .from('whatsapp_config')
    .select('access_token, waba_id')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!cfg?.access_token || !cfg.waba_id) {
    console.log('No WhatsApp config — draft saved only. Submit from Template Manager.')
    return
  }

  const token = decrypt(cfg.access_token)
  const components: MetaComponent[] = []
  if (recipe.header_type === 'image') {
    components.push({
      type: 'HEADER',
      format: 'IMAGE',
      example: {
        header_handle: [process.env.DEFAULT_TEMPLATE_HEADER_HANDLE || ''],
      },
    } as MetaComponent)
  }
  components.push({
    type: 'BODY',
    text: recipe.body,
    example: { body_text: [recipe.sample_values.body] },
  } as MetaComponent)
  if (recipe.footer_text) {
    components.push({ type: 'FOOTER', text: recipe.footer_text } as MetaComponent)
  }
  if (recipe.buttons?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: recipe.buttons.map((b) => {
        if (b.type === 'URL') {
          return {
            type: 'URL',
            text: b.text,
            url: b.url,
            example: b.example ? [b.example] : undefined,
          }
        }
        return b
      }),
    } as MetaComponent)
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${cfg.waba_id}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: recipe.template_name,
        language: recipe.language,
        category: recipe.category,
        components,
      }),
    },
  )
  const json = await res.json()
  console.log('Meta response', res.status, json)

  if (json.id) {
    await supabase
      .from('message_templates')
      .update({
        status: 'PENDING',
        meta_template_id: String(json.id),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row!.id)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
