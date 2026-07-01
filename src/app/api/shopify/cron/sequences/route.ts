import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { createShopifyDiscountCode } from '@/lib/shopify/discount-generator'

export async function GET(request: Request) {
  // 1) Verify cron secret
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret')
  if (supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  const now = new Date().toISOString()

  let sequencesProcessed = 0
  let messagesSent = 0

  try {
    // 2) Find all active in-flight sequences where next_send_at is due
    const { data: trackings } = await supabase
      .from('shopify_recovery_tracking')
      .select(`
        *,
        contacts(name, first_name, phone, whatsapp_marketing_opt_in),
        shopify_automation_sequences(id, trigger_type, is_active)
      `)
      .eq('status', 'in_progress')
      .lte('next_send_at', now)
      .order('created_at', { ascending: true })

    if (trackings && trackings.length > 0) {
      for (const tracking of trackings) {
        const contact: any = tracking.contacts
        const sequence: any = tracking.shopify_automation_sequences

        if (!sequence || !sequence.is_active) {
          // If the sequence itself is deactivated, mark completed and skip
          await supabase
            .from('shopify_recovery_tracking')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', tracking.id)
          continue
        }

        // 3) CONVERSION CHECK
        let isConverted = false

        if (tracking.shopify_checkout_id) {
          // Check if checkout was recovered
          const { data: checkout } = await supabase
            .from('shopify_checkouts')
            .select('status')
            .eq('id', tracking.shopify_checkout_id)
            .maybeSingle()

          if (checkout && checkout.status === 'recovered') {
            isConverted = true
          }
        }

        // Verify if any order was placed by this contact since tracking began
        if (!isConverted) {
          const { data: order } = await supabase
            .from('shopify_orders')
            .select('id')
            .eq('contact_id', tracking.contact_id)
            .gte('created_at', tracking.created_at)
            .limit(1)
            .maybeSingle()

          if (order) {
            isConverted = true
          }
        }

        if (isConverted) {
          // Mark checkout as recovered if linked
          if (tracking.shopify_checkout_id) {
            await supabase
              .from('shopify_checkouts')
              .update({ status: 'recovered', updated_at: new Date().toISOString() })
              .eq('id', tracking.shopify_checkout_id)
          }

          // Mark sequence as converted and halt
          await supabase
            .from('shopify_recovery_tracking')
            .update({ status: 'converted', updated_at: new Date().toISOString() })
            .eq('id', tracking.id)

          sequencesProcessed++
          continue
        }

        // 4) LOAD RULE STEP DEFINITIONS
        const { data: step } = await supabase
          .from('shopify_automation_sequence_steps')
          .select('*')
          .eq('sequence_id', sequence.id)
          .eq('step_order', tracking.current_step)
          .eq('is_active', true)
          .eq('meta_approval_status', 'approved')
          .maybeSingle()

        if (!step) {
          // If step isn't approved/active, skip and try advancing to next step in sequence
          await advanceOrComplete(supabase, tracking, sequence.id, null)
          continue
        }

        // 5) COMPLIANCE: OPT-IN CHECK
        // Step 1 cart abandoned reminder is transactional (uses 24h window), but Step 2, 3, and all browse reminders require marketing opt-in consent
        const requiresOptIn = tracking.current_step > 1 || sequence.trigger_type === 'browse_abandoned'
        if (requiresOptIn && !contact?.whatsapp_marketing_opt_in) {
          // Stop tracking sequence immediately if contact did not opt in
          await supabase
            .from('shopify_recovery_tracking')
            .update({ status: 'stopped', updated_at: new Date().toISOString() })
            .eq('id', tracking.id)
          continue
        }

        // 6) DATA GATHERING & VARIABLE MAPPING
        let productName = 'items'
        let totalPrice = '0.00'
        let checkoutUrl = ''
        let productUrl = ''

        if (sequence.trigger_type === 'cart_abandoned' && tracking.shopify_checkout_id) {
          const { data: checkout } = await supabase
            .from('shopify_checkouts')
            .select('*')
            .eq('id', tracking.shopify_checkout_id)
            .single()

          if (checkout) {
            const lineItems = (checkout.line_items as any[]) || []
            productName = lineItems[0]?.title || 'items in your cart'
            totalPrice = parseFloat(checkout.total_price || '0').toFixed(2)
            checkoutUrl = checkout.abandoned_checkout_url || ''
          }
        } else if (sequence.trigger_type === 'browse_abandoned') {
          const meta = tracking.metadata || {}
          productName = meta.product_title || 'product'
          totalPrice = parseFloat(meta.price || '0').toFixed(2)
          productUrl = meta.product_url || ''
        }

        // Generate dynamic discount code if this is the final step
        let discountCode = tracking.discount_code
        if (tracking.current_step === 3 && !discountCode) {
          const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || 'divyaprabhafoods.myshopify.com'
          const token = process.env.SHOPIFY_ADMIN_API_TOKEN || ''
          discountCode = await createShopifyDiscountCode(storeDomain, token)
        }

        // Map template variables
        const customerName = contact?.first_name || contact?.name || 'Customer'
        const storeName = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'Our Store'

        const mapping: string[] = step.template_variable_mapping || []
        const templateParams = mapping.map((variableName) => {
          if (variableName === 'customer_name') return customerName
          if (variableName === 'product_name') return productName
          if (variableName === 'store_name') return storeName
          if (variableName === 'total_price') return totalPrice
          if (variableName === 'checkout_url') return checkoutUrl
          if (variableName === 'product_url') return productUrl
          if (variableName === 'discount_code') return discountCode || 'WELCOME10'
          return ''
        })

        // Fetch account context to resolve owner user ID
        const { data: account } = await supabase
          .from('accounts')
          .select('owner_user_id')
          .eq('id', tracking.account_id)
          .single()

        const ownerUserId = account?.owner_user_id || tracking.account_id

        // Resolve conversation
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('account_id', tracking.account_id)
          .eq('contact_id', tracking.contact_id)
          .maybeSingle()

        if (!conv) {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({
              account_id: tracking.account_id,
              user_id: ownerUserId,
              contact_id: tracking.contact_id,
            })
            .select('id')
            .single()
          conv = newConv
        }

        if (conv) {
          // Send message
          await engineSendTemplate({
            accountId: tracking.account_id,
            userId: ownerUserId,
            conversationId: conv.id,
            contactId: tracking.contact_id,
            templateName: step.template_name,
            params: templateParams,
          })
          messagesSent++
        }

        // Advance or complete sequence
        await advanceOrComplete(supabase, tracking, sequence.id, discountCode)
        sequencesProcessed++
      }
    }

    return NextResponse.json({
      success: true,
      sequencesProcessed,
      messagesSent,
    })
  } catch (err: any) {
    console.error('[shopify-sequence-cron] internal error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

async function advanceOrComplete(
  supabase: any,
  tracking: any,
  sequenceId: string,
  discountCode: string | null
) {
  const nextStepOrder = tracking.current_step + 1

  // Look for next step in sequence
  const { data: nextStep } = await supabase
    .from('shopify_automation_sequence_steps')
    .select('delay_minutes_from_previous_step')
    .eq('sequence_id', sequenceId)
    .eq('step_order', nextStepOrder)
    .eq('is_active', true)
    .maybeSingle()

  if (nextStep) {
    // Advance to next step
    const nextSendAt = new Date(Date.now() + nextStep.delay_minutes_from_previous_step * 60000).toISOString()
    await supabase
      .from('shopify_recovery_tracking')
      .update({
        current_step: nextStepOrder,
        next_send_at: nextSendAt,
        discount_code: discountCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tracking.id)
  } else {
    // Complete sequence
    await supabase
      .from('shopify_recovery_tracking')
      .update({
        status: 'completed',
        discount_code: discountCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tracking.id)
  }
}
