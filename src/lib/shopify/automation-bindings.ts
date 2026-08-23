import type { SupabaseClient } from '@supabase/supabase-js'
import {
  RECIPE_NAME_RENAMES,
  recipeByName,
} from './whatsapp-template-library'

export type AutomationApproval =
  | 'not_submitted'
  | 'pending'
  | 'approved'
  | 'rejected'

export const SHOPIFY_RULE_BINDINGS = [
  {
    ruleTrigger: 'order_created',
    templateName: 'wacrm_order_confirmed_v2',
  },
  {
    ruleTrigger: 'cod_confirmation',
    templateName: 'wacrm_cod_confirmation_v2',
  },
  {
    ruleTrigger: 'order_fulfilled',
    templateName: 'wacrm_order_shipped_v2',
  },
  {
    ruleTrigger: 'order_delivered',
    templateName: 'wacrm_order_delivered_v2',
  },
] as const

export const SHOPIFY_SEQUENCE_BINDINGS = [
  {
    sequenceTrigger: 'cart_abandoned',
    sequenceName: 'Cart Abandonment Recovery',
    steps: [
      { stepOrder: 1, templateName: 'wacrm_cart_abandoned_v4' },
      { stepOrder: 2, templateName: 'wacrm_cart_reminder_step2_v2' },
      { stepOrder: 3, templateName: 'wacrm_cart_reminder_step3_v2' },
    ],
  },
  {
    sequenceTrigger: 'browse_abandoned',
    sequenceName: 'Browse Abandonment Recovery',
    steps: [
      { stepOrder: 1, templateName: 'wacrm_browse_abandoned_v2' },
    ],
  },
  {
    sequenceTrigger: 'shopify_customer_created',
    sequenceName: 'New Shopify Contact Welcome',
    steps: [
      {
        stepOrder: 1,
        templateName: 'wacrm_festival_broadcast_v2',
        delayMinutes: 30,
      },
      {
        stepOrder: 2,
        templateName: 'wacrm_shop_now_followup_v1',
        delayMinutes: 300,
      },
    ],
  },
] as const

export function approvalFromTemplateStatus(status: string | null | undefined): AutomationApproval {
  const upper = String(status || '').toUpperCase()
  if (upper === 'APPROVED') return 'approved'
  if (upper === 'PENDING' || upper === 'PENDING_REVIEW' || upper === 'IN_APPEAL') {
    return 'pending'
  }
  if (upper === 'REJECTED' || upper === 'DISABLED' || upper === 'PAUSED') return 'rejected'
  return 'not_submitted'
}

/** Cron: wait for Meta approval instead of skipping to the next drip step. */
export function sequenceStepSendDecision(step: {
  is_active?: boolean
  meta_approval_status?: string
} | null): 'send' | 'wait' | 'skip' {
  if (!step) return 'skip'
  if (!step.is_active) return 'skip'
  if (step.meta_approval_status !== 'approved') return 'wait'
  return 'send'
}

export async function propagateTemplateApproval(
  db: SupabaseClient,
  accountId: string,
  templateName: string,
  messageStatus: string,
): Promise<void> {
  const approval = approvalFromTemplateStatus(messageStatus)
  const canonical = RECIPE_NAME_RENAMES[templateName] ?? templateName

  await db
    .from('shopify_automation_rules')
    .update({
      meta_approval_status: approval,
      is_active: approval === 'approved' || approval === 'pending',
    })
    .eq('account_id', accountId)
    .in('template_name', [templateName, canonical])

  const { data: seqs } = await db
    .from('shopify_automation_sequences')
    .select('id')
    .eq('account_id', accountId)
  const seqIds = (seqs ?? []).map((s) => s.id)
  if (seqIds.length === 0) return

  await db
    .from('shopify_automation_sequence_steps')
    .update({
      meta_approval_status: approval,
      is_active: approval === 'approved' || approval === 'pending',
    })
    .in('sequence_id', seqIds)
    .in('template_name', [templateName, canonical])
}

export interface AlignAutomationsResult {
  rulesUpserted: number
  sequencesUpserted: number
  stepsUpserted: number
  namesRemapped: number
}

export async function alignShopifyAutomations(
  db: SupabaseClient,
  accountId: string,
): Promise<AlignAutomationsResult> {
  const { data: templates } = await db
    .from('message_templates')
    .select('name, status')
    .eq('account_id', accountId)

  const statusByName = new Map(
    (templates ?? []).map((t) => [t.name, String(t.status || '')]),
  )

  let namesRemapped = 0
  for (const [from, to] of Object.entries(RECIPE_NAME_RENAMES)) {
    const { data: rules } = await db
      .from('shopify_automation_rules')
      .update({ template_name: to })
      .eq('account_id', accountId)
      .eq('template_name', from)
      .select('id')
    namesRemapped += rules?.length ?? 0
  }

  const { data: seqsForRename } = await db
    .from('shopify_automation_sequences')
    .select('id')
    .eq('account_id', accountId)
  const renameSeqIds = (seqsForRename ?? []).map((s) => s.id)
  if (renameSeqIds.length > 0) {
    for (const [from, to] of Object.entries(RECIPE_NAME_RENAMES)) {
      const { data: steps } = await db
        .from('shopify_automation_sequence_steps')
        .update({ template_name: to })
        .eq('template_name', from)
        .in('sequence_id', renameSeqIds)
        .select('id')
      namesRemapped += steps?.length ?? 0
    }
  }

  let rulesUpserted = 0
  for (const binding of SHOPIFY_RULE_BINDINGS) {
    const recipe = recipeByName(binding.templateName)
    const approval = approvalFromTemplateStatus(statusByName.get(binding.templateName))
    const row = {
      template_name: binding.templateName,
      template_variable_mapping: [...(recipe?.variables ?? ['customer_name'])],
      delay_minutes: recipe?.default_delay_minutes ?? 0,
      meta_approval_status: approval,
      is_active: approval === 'approved' || approval === 'pending',
    }
    const { data: existing } = await db
      .from('shopify_automation_rules')
      .select('id')
      .eq('account_id', accountId)
      .eq('trigger_type', binding.ruleTrigger)
      .maybeSingle()
    if (existing?.id) {
      const { error } = await db
        .from('shopify_automation_rules')
        .update({
          template_name: row.template_name,
          template_variable_mapping: row.template_variable_mapping,
          meta_approval_status: row.meta_approval_status,
        })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await db.from('shopify_automation_rules').insert({
        account_id: accountId,
        trigger_type: binding.ruleTrigger,
        ...row,
      })
      if (error) throw error
    }
    rulesUpserted++
  }

  let sequencesUpserted = 0
  let stepsUpserted = 0
  for (const binding of SHOPIFY_SEQUENCE_BINDINGS) {
    let { data: sequence } = await db
      .from('shopify_automation_sequences')
      .select('id')
      .eq('account_id', accountId)
      .eq('trigger_type', binding.sequenceTrigger)
      .maybeSingle()

    if (!sequence?.id) {
      const { data: created, error } = await db
        .from('shopify_automation_sequences')
        .insert({
          account_id: accountId,
          trigger_type: binding.sequenceTrigger,
          sequence_name: binding.sequenceName,
          is_active: true,
        })
        .select('id')
        .single()
      if (error) throw error
      sequence = created
    } else {
      const { error } = await db
        .from('shopify_automation_sequences')
        .update({ is_active: true, sequence_name: binding.sequenceName })
        .eq('id', sequence.id)
      if (error) throw error
    }
    if (!sequence?.id) {
      throw new Error(`Failed to upsert ${binding.sequenceTrigger} sequence`)
    }
    sequencesUpserted++

    for (const step of binding.steps) {
      const recipe = recipeByName(step.templateName)
      const approval = approvalFromTemplateStatus(statusByName.get(step.templateName))
      const delayMinutes =
        'delayMinutes' in step && typeof step.delayMinutes === 'number'
          ? step.delayMinutes
          : (recipe?.default_delay_minutes ?? 0)
      const stepRow = {
        template_name: step.templateName,
        template_variable_mapping: [...(recipe?.variables ?? ['customer_name'])],
        delay_minutes_from_previous_step: delayMinutes,
        meta_approval_status: approval,
        is_active: true,
      }
      const { data: existingStep } = await db
        .from('shopify_automation_sequence_steps')
        .select('id')
        .eq('sequence_id', sequence.id)
        .eq('step_order', step.stepOrder)
        .maybeSingle()
      if (existingStep?.id) {
        const { error } = await db
          .from('shopify_automation_sequence_steps')
          .update({
            template_name: stepRow.template_name,
            template_variable_mapping: stepRow.template_variable_mapping,
            meta_approval_status: stepRow.meta_approval_status,
          })
          .eq('id', existingStep.id)
        if (error) throw error
      } else {
        const { error } = await db.from('shopify_automation_sequence_steps').insert({
          sequence_id: sequence.id,
          step_order: step.stepOrder,
          ...stepRow,
        })
        if (error) throw error
      }
      stepsUpserted++
    }
  }

  return { rulesUpserted, sequencesUpserted, stepsUpserted, namesRemapped }
}
