import type { SupabaseClient } from '@supabase/supabase-js'
import {
  RECIPE_NAME_RENAMES,
  SHOPIFY_TEMPLATE_LIBRARY,
  recipeToDraftInsert,
} from './whatsapp-template-library'

export interface InstallRecipesResult {
  inserted: number
  skipped: number
  updated: number
  delaysUpdated: number
  namesRemapped: number
  staleDraftsRemoved: number
}

export async function installShopifyTemplateRecipes(
  db: SupabaseClient,
  accountId: string,
  userId: string,
): Promise<InstallRecipesResult> {
  const { data: existing } = await db
    .from('message_templates')
    .select('id, name, language, status')
    .eq('account_id', accountId)

  const byKey = new Map(
    (existing ?? []).map((r) => [
      `${r.name}::${r.language || 'en_US'}`,
      r,
    ]),
  )

  let inserted = 0
  let skipped = 0
  let updated = 0
  for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
    const key = `${recipe.template_name}::${recipe.language}`
    const row = byKey.get(key)
    const payload = recipeToDraftInsert(recipe, accountId, userId)
    if (!row) {
      const { error } = await db.from('message_templates').insert(payload)
      if (error) throw error
      inserted++
      continue
    }
    const status = String(row.status || 'DRAFT').toUpperCase()
    if (status === 'DRAFT' || status === 'REJECTED') {
      const { error } = await db
        .from('message_templates')
        .update({
          category: payload.category,
          header_type: payload.header_type,
          header_media_url: payload.header_media_url,
          body_text: payload.body_text,
          footer_text: payload.footer_text,
          buttons: payload.buttons,
          sample_values: payload.sample_values,
          updated_at: payload.updated_at,
        })
        .eq('id', row.id)
      if (error) throw error
      updated++
    } else {
      skipped++
    }
  }

  const { data: seqs } = await db
    .from('shopify_automation_sequences')
    .select('id')
    .eq('account_id', accountId)
  const seqIds = (seqs ?? []).map((s) => s.id)

  let namesRemapped = 0
  for (const [from, to] of Object.entries(RECIPE_NAME_RENAMES)) {
    const { data: rules } = await db
      .from('shopify_automation_rules')
      .update({ template_name: to })
      .eq('account_id', accountId)
      .eq('template_name', from)
      .select('id')
    namesRemapped += rules?.length ?? 0
    if (seqIds.length > 0) {
      const { data: steps } = await db
        .from('shopify_automation_sequence_steps')
        .update({ template_name: to })
        .eq('template_name', from)
        .in('sequence_id', seqIds)
        .select('id')
      namesRemapped += steps?.length ?? 0
    }
  }

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

  let staleDraftsRemoved = 0
  const staleNames = Object.keys(RECIPE_NAME_RENAMES)
  if (staleNames.length > 0) {
    const { data: removed } = await db
      .from('message_templates')
      .delete()
      .eq('account_id', accountId)
      .in('name', staleNames)
      .in('status', ['DRAFT', 'REJECTED'])
      .select('id')
    staleDraftsRemoved = removed?.length ?? 0
  }

  return {
    inserted,
    skipped,
    updated,
    delaysUpdated,
    namesRemapped,
    staleDraftsRemoved,
  }
}
