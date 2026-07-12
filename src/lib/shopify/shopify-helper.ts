import type { SupabaseClient } from '@supabase/supabase-js'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { SHOPIFY_TEMPLATE_LIBRARY } from './whatsapp-template-library'


export interface ShopifyCustomerPayload {
  id?: number | string
  email?: string | null
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
}

/**
 * Resolves the default account and owner user ID for single-tenant wacrm setups.
 */
export async function getShopifyAccountContext(supabase: SupabaseClient): Promise<{
  accountId: string
  userId: string
}> {
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
  const phone = customer.phone?.trim() || null
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || null

  let contact: any = null

  // 1) Match by phone number
  if (phone) {
    contact = await findExistingContact(supabase, accountId, phone)
  }

  // 2) Fallback to email
  if (!contact && email) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('email', email)
      .maybeSingle()
    contact = data
  }

  const shopifyCustomerId = customer.id ? String(customer.id) : null

  // 2.5) Fallback to shopify_customer_id
  if (!contact && shopifyCustomerId) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('shopify_customer_id', shopifyCustomerId)
      .maybeSingle()
    contact = data
  }

  // 3) Create contact if missing
  if (!contact) {
    // Skip creating a contact with no identifiers — it can't be used for WhatsApp
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
        email: email,
        name: name || email || 'Shopify Customer',
        shopify_customer_id: shopifyCustomerId,
      })
      .select()
      .single()

    if (createError) {
      console.error('[shopify-helper] error creating contact:', createError)
      throw createError
    }
    contact = newContact
  } else {
    // 4) Update contact details if missing or now available
    const updates: any = {}
    if (shopifyCustomerId && contact.shopify_customer_id !== shopifyCustomerId) {
      updates.shopify_customer_id = shopifyCustomerId
    }
    if (email && !contact.email) {
      updates.email = email
    }
    // Fill in phone if the existing contact has a blank phone but we now have one
    if (phone && !contact.phone) {
      updates.phone = phone
    }
    if (name && (contact.name === 'Shopify Customer' || contact.name === contact.phone || !contact.name)) {
      updates.name = name
    }
    if (Object.keys(updates).length > 0) {
      const { data: updated } = await supabase
        .from('contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contact.id)
        .select()
        .single()
      if (updated) contact = updated
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
  order_cancelled: ['order_cancelled'],
  payment_refunded: ['payment_refunded'],
  payment_received: ['payment_received'],
};

function getVariablesForTemplate(templateName: string, key: string): string[] {
  const recipe = SHOPIFY_TEMPLATE_LIBRARY.find((r) => r.template_name === templateName);
  if (recipe) return [...recipe.variables];

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

/**
 * Enqueues a WhatsApp notification by matching the trigger rule and mapping variables.
 */
export async function enqueueShopifyNotification(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  phone: string,
  triggerType: 'cart_abandoned' | 'order_created' | 'order_fulfilled' | 'order_delivered' | 'order_cancelled' | 'payment_refunded' | 'payment_received',
  data: {
    customer_name?: string
    product_name?: string
    store_name?: string
    checkout_url?: string
    order_number?: string
    total_price?: string
    tracking_url?: string
    is_cod?: boolean
  }
): Promise<{ status: 'enqueued' | 'skipped_not_activated' | 'error'; message?: string }> {
  try {
    const events = TRIGGER_EVENT_MAP[triggerType] || [];
    if (events.length === 0) {
      return { status: 'skipped_not_activated' };
    }

    // 1) Load active merchant workflows matching the mapped trigger events
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
      .eq('status', 'active');

    if (wfErr) {
      return { status: 'error', message: 'Failed to load merchant workflows: ' + wfErr.message };
    }

    const matchedWorkflows = (workflows || []).filter((w: any) =>
      w.workflow_templates && events.includes(w.workflow_templates.trigger_event)
    );

    if (matchedWorkflows.length === 0) {
      return { status: 'skipped_not_activated' };
    }

    let enqueuedCount = 0;

    for (const mw of matchedWorkflows) {
      const template = mw.workflow_templates as any;
      if (!template) continue;

      // Conditional routing logic:
      // - COD confirmation ONLY runs if order is COD.
      // - Order confirmation ONLY runs if order is NOT COD.
      if (template.key === 'cod_confirmation' && !data.is_cod) {
        continue;
      }
      if (template.key === 'order_confirmation' && data.is_cod) {
        continue;
      }

      const templateName = template.meta_template_name;
      const variables = getVariablesForTemplate(templateName, template.key);

      // Resolve template variables
      const templateParams = variables.map((variableName) => {
        return data[variableName as keyof typeof data] || '';
      });

      // 2) Insert pending log into workflow_logs
      const { data: logRow, error: logErr } = await supabase
        .from('workflow_logs')
        .insert({
          account_id: accountId,
          workflow_template_id: template.id,
          workflow_name: template.name,
          contact_id: contactId,
          contact_name: data.customer_name || 'Customer',
          contact_phone: phone,
          status: 'pending',
        })
        .select('id')
        .single();

      if (logErr) {
        console.error('[shopify-helper] error logging workflow:', logErr);
      }

      // 3) Enqueue send job
      const delay = template.delay_minutes ?? 0;
      const runAt = new Date(Date.now() + delay * 60000).toISOString();

      const { error: insertError } = await supabase
        .from('whatsapp_send_jobs')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          recipient_phone: phone,
          template_name: templateName,
          template_params: templateParams,
          status: 'pending',
          run_at: runAt,
          workflow_log_id: logRow?.id || null,
        });

      if (insertError) {
        console.error('[shopify-helper] failed to insert send job:', insertError.message);
        if (logRow?.id) {
          await supabase
            .from('workflow_logs')
            .update({ status: 'failed', error_message: insertError.message })
            .eq('id', logRow.id);
        }
      } else {
        enqueuedCount++;
      }
    }

    if (enqueuedCount > 0) {
      return { status: 'enqueued' };
    }

    return { status: 'skipped_not_activated' };
  } catch (err: any) {
    return { status: 'error', message: err.message || String(err) };
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

  // Load the active cart_abandoned sequence rules
  const { data: sequence } = await supabase
    .from('shopify_automation_sequences')
    .select('id, is_active')
    .eq('account_id', accountId)
    .eq('trigger_type', 'cart_abandoned')
    .eq('is_active', true)
    .maybeSingle()

  if (!sequence || !sequence.is_active) return

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
    console.error('Error inserting shopify_recovery_tracking:', insErr)
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


