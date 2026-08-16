import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { deleteMessageTemplate } from '@/lib/whatsapp/meta-api'

export interface ClearTemplatesAutomationsResult {
  templates: number
  automations: number
  shopifyRules: number
  workflows: number
  metaErrors: string[]
}

export async function clearTemplatesAndAutomations(
  db: SupabaseClient,
  accountId: string,
  userId?: string
): Promise<ClearTemplatesAutomationsResult> {
  const metaErrors: string[] = []

  const { data: config } = await db
    .from('whatsapp_config')
    .select('waba_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle()

  const { data: templates } = await db
    .from('message_templates')
    .select('id, name, meta_template_id')
    .eq('account_id', accountId)

  if (config?.waba_id && config.access_token) {
    let accessToken = ''
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      metaErrors.push(
        err instanceof Error ? err.message : 'Could not decrypt WhatsApp token'
      )
    }
    if (accessToken) {
      for (const row of templates ?? []) {
        if (!row.meta_template_id && !row.name) continue
        try {
          await deleteMessageTemplate({
            wabaId: config.waba_id,
            accessToken,
            name: row.name,
            metaTemplateId: row.meta_template_id || undefined,
          })
        } catch (err) {
          metaErrors.push(
            `${row.name}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  }

  const { data: deletedTemplates, error: tplErr } = await db
    .from('message_templates')
    .delete()
    .eq('account_id', accountId)
    .select('id')
  if (tplErr) throw tplErr
  let templatesDeleted = deletedTemplates?.length ?? 0
  if (userId) {
    const extra = await db.from('message_templates').delete().eq('user_id', userId).select('id')
    templatesDeleted += extra.data?.length ?? 0
  }

  const { data: deletedAutomations, error: autoErr } = await db
    .from('automations')
    .delete()
    .eq('account_id', accountId)
    .select('id')
  if (autoErr) throw autoErr
  let automationsDeleted = deletedAutomations?.length ?? 0
  if (userId) {
    const extra = await db.from('automations').delete().eq('user_id', userId).select('id')
    automationsDeleted += extra.data?.length ?? 0
  }

  let shopifyRules = 0
  const { data: deletedRules, error: rulesErr } = await db
    .from('shopify_automation_rules')
    .delete()
    .eq('account_id', accountId)
    .select('id')
  if (rulesErr) {
    console.warn('[clear-templates] shopify_automation_rules:', rulesErr.message)
  } else {
    shopifyRules = deletedRules?.length ?? 0
  }

  let workflows = 0
  const { data: deletedWf, error: wfErr } = await db
    .from('merchant_workflows')
    .delete()
    .eq('merchant_id', accountId)
    .select('id')
  if (wfErr) {
    const retry = await db
      .from('merchant_workflows')
      .delete()
      .eq('account_id', accountId)
      .select('id')
    workflows = retry.data?.length ?? 0
  } else {
    workflows = deletedWf?.length ?? 0
  }

  return {
    templates: templatesDeleted,
    automations: automationsDeleted,
    shopifyRules,
    workflows,
    metaErrors,
  }
}
