import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SHOPIFY_TEMPLATE_LIBRARY,
  recipeToDraftInsert,
} from './whatsapp-template-library'

export interface InstallRecipesResult {
  inserted: number
  skipped: number
  delaysUpdated: number
}

export async function installShopifyTemplateRecipes(
  db: SupabaseClient,
  accountId: string,
  userId: string,
): Promise<InstallRecipesResult> {
  const { data: existing } = await db
    .from('message_templates')
    .select('name, language')
    .eq('account_id', accountId)

  const have = new Set(
    (existing ?? []).map((r) => `${r.name}::${r.language || 'en_US'}`),
  )

  let inserted = 0
  let skipped = 0
  for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
    const key = `${recipe.template_name}::${recipe.language}`
    if (have.has(key)) {
      skipped++
      continue
    }
    const { error } = await db
      .from('message_templates')
      .insert(recipeToDraftInsert(recipe, accountId, userId))
    if (error) throw error
    inserted++
  }

  const { data: seqs } = await db
    .from('shopify_automation_sequences')
    .select('id')
    .eq('account_id', accountId)
  const seqIds = (seqs ?? []).map((s) => s.id)

  let delaysUpdated = 0
  if (seqIds.length > 0) {
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      const { data: steps } = await db
        .from('shopify_automation_sequence_steps')
        .update({
          delay_minutes_from_previous_step: recipe.default_delay_minutes,
          template_variable_mapping: [...recipe.variables],
          updated_at: new Date().toISOString(),
        })
        .eq('template_name', recipe.template_name)
        .in('sequence_id', seqIds)
        .select('id')
      delaysUpdated += steps?.length ?? 0
    }
  }

  return { inserted, skipped, delaysUpdated }
}
