import type { SupabaseClient } from '@supabase/supabase-js'
import { findExistingContact, findExistingContactByEmail, isUniqueViolation } from '@/lib/contacts/dedupe'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'
import { toCustomerStoreName, toCustomerStoreUrl } from '@/lib/shopify/storefront-url'
import { canonicalRecipeName, recipeByName } from './whatsapp-template-library'
import { shouldEnqueueWorkflowTemplate } from './order-notify'


export interface ShopifyCustomerPayload {
  id?: number | string
  email?: string | null
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  marketing_opt_in?: boolean
}

/**
 * Resolves the account that can send Shopify WhatsApp.
 * Multiple `accounts` rows make `limit(1)` non-deterministic and can
 * attach store webhooks to a tenant with no WABA.
 */
export async function getShopifyAccountContext(supabase: SupabaseClient): Promise<{
  accountId: string
  userId: string
}> {
  const { data: wa } = await supabase
    .from('whatsapp_config')
    .select('account_id, user_id')
    .not('account_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (wa?.account_id) {
    const { data: linked } = await supabase
      .from('accounts')
      .select('id, owner_user_id')
      .eq('id', wa.account_id)
      .maybeSingle()
    return {
      accountId: wa.account_id,
      userId: linked?.owner_user_id || wa.user_id,
    }
  }

  const { data, error } = await supabase
    .from('accounts')
    .select('id, owner_user_id')
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error('Failed to resolve wacrm account context: ' + (error?.message || 'No accounts found.'))
  }

  return {
    accountId: data.id,
    userId: data.owner_user_id,
  }
}

/**
 * Match an incoming Shopify customer to a Contact by phone (preferred) or email.
 * Inserts a new Contact if no match is found.
 */
export async function matchOrCreateShopifyContact(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  customer: ShopifyCustomerPayload
): Promise<any> {
  const email = customer.email?.trim() || null
  const rawPhone = customer.phone?.trim() || null
  const phone = rawPhone ? (toMetaPhone(rawPhone) || null) : null
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || null
  const company = customer.company?.trim() || null
  const optedIn = customer.marketing_opt_in
  const shopifyCustomerId = customer.id ? String(customer.id) : null

  let contact: any = null

  // 1) Match by Shopify customer id so re-syncs update the same row
  if (shopifyCustomerId) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('shopify_customer_id', shopifyCustomerId)
      .limit(1)
    contact = data?.[0] ?? null
  }

  // 2) Match by phone number
  if (!contact && phone) {
    contact = await findExistingContact(supabase, accountId, phone)
  }

  // 3) Same email = same person (case-insensitive)
  if (!contact && email) {
    contact = await findExistingContactByEmail(supabase, accountId, email)
  }

  // 3) Create contact if missing
  if (!contact) {
    // Skip creating a contact with no identifiers. Email-only is allowed
    // (Contacts page); WhatsApp send paths skip empty phones.
    if (!phone && !email) {
      console.warn('[shopify-helper] skipping contact creation: no phone or email in payload')
      return null
    }

    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        phone: phone || '',
        email: email ? email.toLowerCase() : email,
        name: name || email || 'Shopify Customer',
        shopify_customer_id: shopifyCustomerId,
        company: company || undefined,
        marketing_opt_in: optedIn ?? true,
        whatsapp_marketing_opt_in: optedIn ?? true,
        marketing_opt_in_source: optedIn === false ? null : 'checkout',
        marketing_opt_in_at: optedIn === false ? null : new Date().toISOString(),
      })
      .select()
      .single()

    if (createError) {
      if (isUniqueViolation(createError)) {
        if (phone) {
          contact = await findExistingContact(supabase, accountId, phone)
        }
        if (!contact && email) {
          contact = await findExistingContactByEmail(supabase, accountId, email)
        }
      }
      if (!contact) {
        console.error('[shopify-helper] error creating contact:', createError)
        throw createError
      }
    } else {
      contact = newContact
    }

    if (!contact) {
      throw createError || new Error('Failed to create Shopify contact')
    }

    if (!newContact && shopifyCustomerId) {
      const { data: updated } = await supabase
        .from('contacts')
        .update({
          shopify_customer_id: shopifyCustomerId,
          email: email || undefined,
          phone,
          name: name || undefined,
          company: company || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id)
        .select()
        .single()
      if (updated) contact = updated
    }

    if (newContact && optedIn) {
      await supabase.from('opt_in_events').insert({
        account_id: accountId,
        contact_id: contact.id,
        event_type: 'opt_in',
        source: 'checkout',
        raw_payload: { customer },
      })
    }
  } else {
    // 4) Refresh profile from the latest Shopify payload so Contacts stays current
    const updates: any = {
      updated_at: new Date().toISOString(),
    }
    if (shopifyCustomerId && contact.shopify_customer_id !== shopifyCustomerId) {
      updates.shopify_customer_id = shopifyCustomerId
    }
    if (email) {
      updates.email = email.toLowerCase()
    }
    if (phone && contact.phone !== phone) {
      updates.phone = phone
    }
    if (name && name !== 'Shopify Customer') {
      updates.name = name
    }
    if (company) {
      updates.company = company
    }

    let optInLogged = false
    if (optedIn === true && !contact.marketing_opt_in) {
      updates.marketing_opt_in = true
      updates.whatsapp_marketing_opt_in = true
      updates.marketing_opt_in_source = 'checkout'
      updates.marketing_opt_in_at = new Date().toISOString()
      updates.marketing_opt_out_at = null
      optInLogged = true
    }

    if (Object.keys(updates).length > 0) {
      const { data: updated } = await supabase
        .from('contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contact.id)
        .select()
        .single()
      if (updated) {
        contact = updated
        if (optInLogged) {
          await supabase.from('opt_in_events').insert({
            account_id: accountId,
            contact_id: contact.id,
            event_type: 'opt_in',
            source: 'checkout',
            raw_payload: { customer },
          })
        }
      }
    }
  }

  return contact
}

/**
 * Resolves the pipeline ID and stage IDs (first stage and last 'Won' stage)
 * for the account, seeding them if they do not exist.
 */
export async function resolvePipelineAndStages(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<{
  pipelineId: string
  firstStageId: string
  wonStageId: string
}> {
  // Find first pipeline
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('id, name')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  let pipelineId = ''

  if (!pipeline) {
    // Seed pipeline
    const { data: newPipeline, error: pipeError } = await supabase
      .from('pipelines')
      .insert({
        account_id: accountId,
        user_id: userId,
        name: 'Shopify E-Commerce Pipeline',
      })
      .select()
      .single()

    if (pipeError || !newPipeline) {
      throw new Error('Failed to seed default Shopify sales pipeline: ' + pipeError?.message)
    }
    pipelineId = newPipeline.id

    // Seed default stages
    const defaultStages = [
      { name: 'Abandoned Cart', color: '#ef4444', position: 0 },
      { name: 'Nudged / In Recovery', color: '#f59e0b', position: 1 },
      { name: 'Cart Recovered', color: '#10b981', position: 2 },
      { name: 'Order Confirmed', color: '#3b82f6', position: 3 },
      { name: 'Delivered', color: '#22c55e', position: 4 },
    ]

    const stagesPayload = defaultStages.map((s) => ({
      pipeline_id: pipelineId,
      name: s.name,
      color: s.color,
      position: s.position,
    }))

    await supabase.from('pipeline_stages').insert(stagesPayload)
  } else {
    pipelineId = pipeline.id
    // Rename default Sales Pipeline if it is still named 'Sales Pipeline'
    if (pipeline.name === 'Sales Pipeline') {
      await supabase
        .from('pipelines')
        .update({ name: 'Shopify E-Commerce Pipeline' })
        .eq('id', pipelineId)
    }
  }

  // Load stages sorted by position
  const { data: stages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })

  if (stagesError || !stages || stages.length === 0) {
    throw new Error('Failed to resolve stages for pipeline: ' + (stagesError?.message || 'No stages found.'))
  }

  // Automatically migrate existing default B2B stages to E-Commerce stages in DB
  for (const st of stages) {
    if (st.name === 'New Lead') {
      await supabase.from('pipeline_stages').update({ name: 'Abandoned Cart', color: '#ef4444' }).eq('id', st.id)
      st.name = 'Abandoned Cart'
    } else if (st.name === 'Qualified') {
      await supabase.from('pipeline_stages').update({ name: 'Nudged / In Recovery', color: '#f59e0b' }).eq('id', st.id)
      st.name = 'Nudged / In Recovery'
    } else if (st.name === 'Proposal Sent') {
      await supabase.from('pipeline_stages').update({ name: 'Cart Recovered', color: '#10b981' }).eq('id', st.id)
      st.name = 'Cart Recovered'
    } else if (st.name === 'Negotiation') {
      await supabase.from('pipeline_stages').update({ name: 'Order Confirmed', color: '#3b82f6' }).eq('id', st.id)
      st.name = 'Order Confirmed'
    } else if (st.name === 'Won') {
      await supabase.from('pipeline_stages').update({ name: 'Delivered', color: '#22c55e' }).eq('id', st.id)
      st.name = 'Delivered'
    }
  }

  const firstStageId = stages[0].id
  const wonStage = stages.find((s) => s.name.toLowerCase() === 'delivered') || stages[stages.length - 1]
  const wonStageId = wonStage.id

  return {
    pipelineId,
    firstStageId,
    wonStageId,
  }
}

/**
 * Creates or updates a Deal matching a Shopify checkout event.
 */
export async function createOrUpdateShopifyDeal(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  contactId: string,
  shopifyCheckoutId: string,
  title: string,
  totalPrice: number,
  currency: string
): Promise<string> {
  // Check if we already have a checkout with this ID that links to a deal
  const { data: existingCheckout } = await supabase
    .from('shopify_checkouts')
    .select('deal_id')
    .eq('shopify_checkout_id', shopifyCheckoutId)
    .maybeSingle()

  let dealId = existingCheckout?.deal_id

  const { pipelineId, firstStageId } = await resolvePipelineAndStages(supabase, accountId, userId)

  if (dealId) {
    // Update existing deal
    await supabase
      .from('deals')
      .update({
        value: totalPrice,
        currency: currency || 'USD',
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)
  } else {
    // Create new deal
    const { data: newDeal, error: dealError } = await supabase
      .from('deals')
      .insert({
        account_id: accountId,
        user_id: userId,
        pipeline_id: pipelineId,
        stage_id: firstStageId,
        contact_id: contactId,
        title: title,
        value: totalPrice,
        currency: currency || 'USD',
        status: 'open',
      })
      .select()
      .single()

    if (dealError || !newDeal) {
      console.error('[shopify-helper] error creating deal:', dealError)
      throw new Error('Failed to create Shopify deal: ' + dealError?.message)
    }
    dealId = newDeal.id
  }

  return dealId
}

/**
 * Moves a Deal's status to 'won' and sets its stage to the 'Won' stage.
 */
export async function markDealAsWon(
  supabase: SupabaseClient,
  dealId: string,
  wonStageId: string
): Promise<void> {
  await supabase
    .from('deals')
    .update({
      status: 'won',
      stage_id: wonStageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
}

const TRIGGER_EVENT_MAP: Record<string, string[]> = {
  cart_abandoned: ['cart_abandoned_1h', 'cart_abandoned_24h', 'cart_abandoned_72h'],
  order_created: ['order_created'],
  order_fulfilled: ['fulfillment_shipped'],
  order_delivered: ['delivered'],
  shipment_in_transit: [],
  shipment_ofd: [],
  shipment_ndr: [],
  order_cancelled: ['order_cancelled'],
  payment_refunded: ['payment_refunded'],
  payment_received: ['payment_received'],
}

const LAST_RESORT_TEMPLATES: Partial<Record<string, string[]>> = {
  order_created: ['wacrm_order_confirmed_v2'],
  order_fulfilled: ['wacrm_order_shipped_v2'],
  shipment_in_transit: ['wacrm_order_in_transit_v1', 'wacrm_order_shipped_v2'],
  shipment_ofd: ['wacrm_order_ofd_v1'],
  shipment_ndr: ['wacrm_order_ndr_v1'],
  order_delivered: ['wacrm_order_delivered_v2'],
}

const DISPATCH_TRIGGERS = new Set(['order_fulfilled', 'shipment_in_transit']);

function getVariablesForTemplate(templateName: string, key: string): string[] {
  const recipe = recipeByName(templateName)
  if (recipe) return [...recipe.variables]

  // Fallbacks for categories not in initial library
  if (key === 'order_cancelled') return ['customer_name', 'order_number'];
  if (key === 'refund_processed') return ['customer_name', 'order_number', 'total_price'];
  if (key === 'payment_received') return ['customer_name', 'order_number'];
  if (key === 'out_for_delivery') return ['customer_name', 'order_number'];
  if (key === 'delivery_delayed') return ['customer_name', 'order_number'];
  if (key === 'return_initiated') return ['customer_name', 'order_number'];
  if (key === 'return_picked_up') return ['customer_name', 'order_number'];

  return ['customer_name', 'order_number', 'total_price'];
}

export type ShopifyNotifyTrigger =
  | 'cart_abandoned'
  | 'order_created'
  | 'order_fulfilled'
  | 'order_delivered'
  | 'shipment_in_transit'
  | 'shipment_ofd'
  | 'shipment_ndr'
  | 'order_cancelled'
  | 'payment_refunded'
  | 'payment_received'

export interface ShopifyNotifyData {
  customer_name?: string
  product_name?: string
  store_name?: string
  checkout_url?: string
  order_number?: string
  total_price?: string
  tracking_url?: string
  courier_name?: string
  awb?: string
  is_cod?: boolean
  shopify_order_id?: string
  ndr_bucket?: string
}

export interface EnqueueNotificationResult {
  status: 'enqueued' | 'skipped_not_activated' | 'error'
  message?: string
  jobIds: string[]
}

function mapTemplateParams(
  variableNames: string[],
  data: ShopifyNotifyData,
): string[] {
  return variableNames.map((variableName) => {
    const value = (data as Record<string, string | boolean | undefined>)[variableName]
    const asString = value == null || value === false ? '' : String(value)
    if (variableName === 'checkout_url' || variableName === 'product_url') {
      return toCustomerStoreUrl(asString)
    }
    if (variableName === 'store_name') {
      return toCustomerStoreName(asString)
    }
    return asString
  })
}

async function resolveRecipientPhone(
  supabase: SupabaseClient,
  contactId: string,
  phone: string,
): Promise<string> {
  const fromArg = toMetaPhone(phone)
  if (fromArg) return fromArg
  const { data } = await supabase
    .from('contacts')
    .select('phone')
    .eq('id', contactId)
    .maybeSingle()
  return toMetaPhone(data?.phone)
}

async function insertOrReuseSendJob(
  supabase: SupabaseClient,
  row: {
    account_id: string
    contact_id: string
    recipient_phone: string
    template_name: string
    template_params: string[]
    run_at: string
    workflow_log_id?: string | null
    idempotency_key: string | null
  },
): Promise<string | null> {
  if (row.idempotency_key) {
    const { data: existing, error: existingErr } = await supabase
      .from('whatsapp_send_jobs')
      .select('id, status')
      .eq('account_id', row.account_id)
      .eq('idempotency_key', row.idempotency_key)
      .maybeSingle()

    if (!existingErr && existing?.id) {
      if (existing.status === 'failed') {
        await supabase
          .from('whatsapp_send_jobs')
          .update({
            status: 'pending',
            attempts: 0,
            last_error: null,
            template_params: row.template_params,
            run_at: row.run_at,
          })
          .eq('id', existing.id)
      }
      return existing.id
    }
  }

  // Production `whatsapp_send_jobs` has no recipient_phone / updated_at
  // (027 + 048). Writing those columns returns PGRST204 and the order
  // WhatsApp is skipped. Phone is read from contacts at send time.
  const payload = {
    account_id: row.account_id,
    contact_id: row.contact_id,
    template_name: row.template_name,
    template_params: row.template_params,
    status: 'pending',
    run_at: row.run_at,
    workflow_log_id: row.workflow_log_id || null,
    idempotency_key: row.idempotency_key,
  }

  let { data: inserted, error: insertError } = await supabase
    .from('whatsapp_send_jobs')
    .insert(payload)
    .select('id')
    .single()

  if (insertError && /idempotency_key/i.test(insertError.message)) {
    const { idempotency_key: _ignored, ...withoutKey } = payload
    const retry = await supabase
      .from('whatsapp_send_jobs')
      .insert(withoutKey)
      .select('id')
      .single()
    inserted = retry.data
    insertError = retry.error
  }

  if (insertError) {
    if (isUniqueViolation(insertError) && row.idempotency_key) {
      const { data: raced } = await supabase
        .from('whatsapp_send_jobs')
        .select('id')
        .eq('account_id', row.account_id)
        .eq('idempotency_key', row.idempotency_key)
        .maybeSingle()
      return raced?.id || null
    }
    console.error('[shopify-helper] failed to insert send job:', insertError.message)
    return null
  }

  return inserted?.id || null
}

function notifyIdempotencyKey(
  triggerType: string,
  templateName: string,
  data: ShopifyNotifyData,
): string | null {
  if (DISPATCH_TRIGGERS.has(triggerType) && data.shopify_order_id) {
    return `shipment_dispatched:${data.shopify_order_id}`
  }
  if (triggerType === 'shipment_ofd' && data.shopify_order_id) {
    return `shipment_ofd:${data.shopify_order_id}`
  }
  if (triggerType === 'order_delivered' && data.shopify_order_id) {
    return `shipment_delivered:${data.shopify_order_id}`
  }
  if (triggerType === 'shipment_ndr' && data.shopify_order_id) {
    return `shipment_ndr:${data.shopify_order_id}:${data.ndr_bucket || 'ndr'}`
  }
  if (data.shopify_order_id) {
    return `${triggerType}:${data.shopify_order_id}:${templateName}`
  }
  if (triggerType === 'cart_abandoned' && data.checkout_url) {
    return `${triggerType}:${data.checkout_url}:${templateName}`
  }
  return null
}

/**
 * Enqueues a WhatsApp notification by matching the trigger rule and mapping variables.
 */
export async function enqueueShopifyNotification(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  phone: string,
  triggerType: ShopifyNotifyTrigger,
  data: ShopifyNotifyData,
): Promise<EnqueueNotificationResult> {
  const jobIds: string[] = []
  try {
    const recipientPhone = await resolveRecipientPhone(supabase, contactId, phone)
    if (!recipientPhone) {
      return {
        status: 'error',
        message:
          'No WhatsApp number on this order or contact. Add a mobile on the Shopify customer and resend.',
        jobIds,
      }
    }

    if (triggerType === 'cart_abandoned') {
      const { data: cartSeq } = await supabase
        .from('shopify_automation_sequences')
        .select('id')
        .eq('account_id', accountId)
        .eq('trigger_type', 'cart_abandoned')
        .eq('is_active', true)
        .maybeSingle()
      if (cartSeq) {
        return { status: 'enqueued', jobIds }
      }
    }

    const events = TRIGGER_EVENT_MAP[triggerType] || []
    const queuedTemplates = new Set<string>()

    const queueJob = async (opts: {
      templateName: string
      templateKey: string
      templateParams: string[]
      delayMinutes: number
      workflowLogId?: string | null
    }) => {
      if (queuedTemplates.has(opts.templateName)) return
      const jobId = await insertOrReuseSendJob(supabase, {
        account_id: accountId,
        contact_id: contactId,
        recipient_phone: recipientPhone,
        template_name: opts.templateName,
        template_params: opts.templateParams,
        run_at: new Date(Date.now() + opts.delayMinutes * 60000).toISOString(),
        workflow_log_id: opts.workflowLogId || null,
        idempotency_key: notifyIdempotencyKey(triggerType, opts.templateName, data),
      })
      if (jobId) {
        queuedTemplates.add(opts.templateName)
        jobIds.push(jobId)
      }
    }

    if (events.length > 0) {
      const { data: workflows, error: wfErr } = await supabase
        .from('merchant_workflows')
        .select(`
          id,
          message_template,
          config,
          workflow_templates (
            id,
            key,
            name,
            trigger_event,
            delay_minutes,
            meta_template_name
          )
        `)
        .eq('merchant_id', accountId)
        .eq('status', 'active')

      if (wfErr) {
        console.warn('[shopify-helper] merchant_workflows load failed, falling back to rules:', wfErr.message)
      } else {
        const matchedWorkflows = (workflows || []).filter((w: any) =>
          w.workflow_templates && events.includes(w.workflow_templates.trigger_event)
        )

        for (const mw of matchedWorkflows) {
          const template = mw.workflow_templates as any
          if (!template) continue
          if (!shouldEnqueueWorkflowTemplate(template.key, !!data.is_cod)) continue

          const templateName = canonicalRecipeName(template.meta_template_name)
          const variables = getVariablesForTemplate(templateName, template.key)
          const templateParams = mapTemplateParams(variables, data)

          const { data: logRow } = await supabase
            .from('workflow_logs')
            .insert({
              account_id: accountId,
              workflow_template_id: template.id,
              workflow_name: template.name,
              contact_id: contactId,
              contact_name: data.customer_name || 'Customer',
              contact_phone: recipientPhone,
              status: 'pending',
            })
            .select('id')
            .single()

          await queueJob({
            templateName,
            templateKey: template.key,
            templateParams,
            delayMinutes: template.delay_minutes ?? 0,
            workflowLogId: logRow?.id || null,
          })
        }
      }
    }

    if (triggerType === 'order_created' && data.is_cod && !queuedTemplates.has(canonicalRecipeName('wacrm_cod_confirmation_v1'))) {
      const { data: codRule } = await supabase
        .from('shopify_automation_rules')
        .select('*')
        .eq('account_id', accountId)
        .eq('trigger_type', 'cod_confirmation')
        .eq('is_active', true)
        .eq('meta_approval_status', 'approved')
        .maybeSingle()
      if (codRule) {
        const mapping: string[] = Array.isArray(codRule.template_variable_mapping)
          ? codRule.template_variable_mapping
          : ['customer_name', 'order_number', 'total_price']
        await queueJob({
          templateName: canonicalRecipeName(codRule.template_name),
          templateKey: 'cod_confirmation',
          templateParams: mapTemplateParams(mapping, data),
          delayMinutes: codRule.delay_minutes ?? 0,
        })
      }
    }

    if (jobIds.length === 0) {
      const ruleTriggers: string[] = [triggerType]
      if (triggerType === 'order_created' && data.is_cod) {
        ruleTriggers.push('cod_confirmation')
      }

      for (const ruleTrigger of ruleTriggers) {
        const { data: rule } = await supabase
          .from('shopify_automation_rules')
          .select('*')
          .eq('account_id', accountId)
          .eq('trigger_type', ruleTrigger)
          .eq('is_active', true)
          .maybeSingle()

        if (!rule) continue
        const mapping: string[] = Array.isArray(rule.template_variable_mapping)
          ? rule.template_variable_mapping
          : []
        await queueJob({
          templateName: canonicalRecipeName(rule.template_name),
          templateKey: ruleTrigger,
          templateParams: mapTemplateParams(mapping, data),
          delayMinutes: rule.delay_minutes ?? 0,
        })
      }
    }

    // Transactional order + shipment messages must never silently drop if
    // workflows/rules were paused. Queue the utility recipe as last resort.
    if (jobIds.length === 0) {
      const lastResortNames = LAST_RESORT_TEMPLATES[triggerType] || []
      let chosen = lastResortNames[0] ? canonicalRecipeName(lastResortNames[0]) : ''
      if (lastResortNames.length > 1) {
        const { data: approved } = await supabase
          .from('message_templates')
          .select('name, status')
          .eq('account_id', accountId)
          .in('name', lastResortNames.map((n) => canonicalRecipeName(n)))
        const approvedSet = new Set(
          (approved || [])
            .filter((row) => String(row.status || '').toUpperCase() === 'APPROVED')
            .map((row) => row.name),
        )
        chosen =
          lastResortNames
            .map((n) => canonicalRecipeName(n))
            .find((n) => approvedSet.has(n)) || chosen
      }
      if (chosen) {
        const recipe = recipeByName(chosen)
        await queueJob({
          templateName: chosen,
          templateKey: triggerType,
          templateParams: mapTemplateParams(
            recipe ? [...recipe.variables] : ['customer_name', 'order_number', 'total_price'],
            data,
          ),
          delayMinutes: 0,
        })
      }
      if (triggerType === 'order_created' && data.is_cod) {
        await queueJob({
          templateName: canonicalRecipeName('wacrm_cod_confirmation_v1'),
          templateKey: 'cod_confirmation',
          templateParams: mapTemplateParams(
            ['customer_name', 'order_number', 'total_price'],
            data,
          ),
          delayMinutes: 0,
        })
      }
    }

    if (jobIds.length > 0) {
      return { status: 'enqueued', jobIds }
    }

    return {
      status: 'skipped_not_activated',
      message: `No active ${triggerType} WhatsApp template/workflow`,
      jobIds,
    }
  } catch (err: any) {
    return { status: 'error', message: err.message || String(err), jobIds }
  }
}

/**
 * Creates a shopify_recovery_tracking record for the checkout if sequence is active.
 */
export async function initializeCheckoutRecoverySequence(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  shopifyCheckoutStringId: string,
  checkoutCreatedAt: string
): Promise<void> {
  const { data: contactRow } = await supabase
    .from('contacts')
    .select('phone')
    .eq('id', contactId)
    .maybeSingle()
  if (!hasWhatsAppPhone(contactRow?.phone)) {
    return
  }

  // Resolve the UUID of the checkout row first
  const { data: checkout } = await supabase
    .from('shopify_checkouts')
    .select('id')
    .eq('shopify_checkout_id', shopifyCheckoutStringId)
    .maybeSingle()

  if (!checkout) return

  // Check if we already have an active sequence running for this checkout using the resolved UUID
  const { data: existingTracking } = await supabase
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('shopify_checkout_id', checkout.id)
    .in('status', ['in_progress', 'converted'])
    .limit(1)
    .maybeSingle()

  if (existingTracking) return

  let { data: sequence } = await supabase
    .from('shopify_automation_sequences')
    .select('id, is_active')
    .eq('account_id', accountId)
    .eq('trigger_type', 'cart_abandoned')
    .maybeSingle()

  if (!sequence) return

  if (!sequence.is_active) {
    await supabase
      .from('shopify_automation_sequences')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', sequence.id)
    sequence = { ...sequence, is_active: true }
  }

  // One cart drip per contact — Shopify may upsert the same cart under
  // checkout id, token, and cart_token as separate rows.
  await supabase
    .from('shopify_recovery_tracking')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('sequence_id', sequence.id)
    .eq('status', 'in_progress')
    .neq('shopify_checkout_id', checkout.id)

  // Load step 1 to get delay
  const { data: step } = await supabase
    .from('shopify_automation_sequence_steps')
    .select('delay_minutes_from_previous_step')
    .eq('sequence_id', sequence.id)
    .eq('step_order', 1)
    .eq('is_active', true)
    .maybeSingle()

  const delay = step?.delay_minutes_from_previous_step ?? 30
  const nextSendAt = new Date(new Date(checkoutCreatedAt).getTime() + delay * 60000).toISOString()

  // Insert sequence tracking using the resolved checkout UUID
  const { error: insErr } = await supabase
    .from('shopify_recovery_tracking')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      shopify_checkout_id: checkout.id,
      sequence_id: sequence.id,
      current_step: 1,
      status: 'in_progress',
      next_send_at: nextSendAt,
    })

  if (insErr) {
    if (insErr.code === '23505') return
    console.error('Error inserting shopify_recovery_tracking:', insErr)
  }
}

/**
 * Festival + shop-now drip for a brand-new Shopify customer (customers/create).
 * Not used on bulk sync or customer update.
 */
export async function startShopifyCustomerWelcomeDrip(
  supabase: SupabaseClient,
  accountId: string,
  contact: { id: string; phone?: string | null },
): Promise<void> {
  if (!contact.phone?.trim()) return

  const createdAt = Date.parse(String((contact as { created_at?: string }).created_at || ''))
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 5 * 60 * 1000) {
    return
  }

  const { data: sequence } = await supabase
    .from('shopify_automation_sequences')
    .select('id, is_active')
    .eq('account_id', accountId)
    .eq('trigger_type', 'shopify_customer_created')
    .maybeSingle()

  if (!sequence?.id || !sequence.is_active) return

  const { data: existing } = await supabase
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', contact.id)
    .eq('sequence_id', sequence.id)
    .in('status', ['in_progress', 'converted', 'completed'])
    .limit(1)
    .maybeSingle()
  if (existing) return

  const { data: step } = await supabase
    .from('shopify_automation_sequence_steps')
    .select('delay_minutes_from_previous_step')
    .eq('sequence_id', sequence.id)
    .eq('step_order', 1)
    .eq('is_active', true)
    .maybeSingle()

  const delay = step?.delay_minutes_from_previous_step ?? 30
  const nextSendAt = new Date(Date.now() + delay * 60000).toISOString()

  const { error } = await supabase.from('shopify_recovery_tracking').insert({
    account_id: accountId,
    contact_id: contact.id,
    sequence_id: sequence.id,
    current_step: 1,
    status: 'in_progress',
    next_send_at: nextSendAt,
  })
  if (error && error.code !== '23505') {
    console.error('[shopify-helper] welcome drip insert failed:', error)
  }
}

/**
 * Automatically moves a Deal's stage by name.
 */
export async function moveDealToStageName(
  supabase: SupabaseClient,
  dealId: string,
  stageName: string,
  accountId: string
): Promise<void> {
  try {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle()

    if (pipeline) {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipeline.id)
        .eq('name', stageName)
        .maybeSingle()

      if (stage) {
        await supabase
          .from('deals')
          .update({ stage_id: stage.id, updated_at: new Date().toISOString() })
          .eq('id', dealId)
      }
    }
  } catch (err) {
    console.error(`[shopify-helper] error transitioning deal ${dealId} to stage ${stageName}:`, err)
  }
}


