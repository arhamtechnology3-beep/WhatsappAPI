import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { enqueueShopifyNotification, initializeCheckoutRecoverySequence, moveDealToStageName } from '@/lib/shopify/shopify-helper'
import { authorizeCron } from '@/lib/cron/auth'
import { findOrCreateConversation } from '@/lib/inbox/find-or-create-conversation'
import { isCartSequenceTemplate } from '@/lib/shopify/sequence-dedupe'

export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied
  return runShopifyAbandonedCron()
}

export async function runShopifyAbandonedCron() {
  const supabase = supabaseAdmin()
  const thresholdMinutes = parseInt(process.env.ABANDONED_CART_THRESHOLD_MINUTES || '30')
  const thresholdDate = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString()

  let checkoutsNotified = 0
  let jobsProcessed = 0

  try {
    // 2) ABANDONMENT DETECTION
    // Find all shopify_checkouts where status = 'open' and created_at <= thresholdDate
    const { data: openCheckouts } = await supabase
      .from('shopify_checkouts')
      .select('*, contacts(name, phone, email)')
      .eq('status', 'open')
      .lte('created_at', thresholdDate)

    if (openCheckouts && openCheckouts.length > 0) {
      for (const checkout of openCheckouts) {
        // Do not treat "any later order for this contact" as recovery of
        // this checkout — that would stop a different live cart.
        const contact: any = checkout.contacts
        const customerFirstName = contact?.name?.split(' ')[0] || 'Customer'
        
        // Parse product name from line items (first item)
        const lineItems = (checkout.line_items as any[]) || []
        const productName = lineItems[0]?.title || 'your cart items'
        const checkoutUrl = checkout.abandoned_checkout_url || ''
        const storeName = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'Our Store'

        const notifyRes = await initializeCheckoutRecoverySequence(
          supabase,
          checkout.account_id,
          checkout.contact_id,
          checkout.shopify_checkout_id ? String(checkout.shopify_checkout_id) : '',
          checkout.created_at,
        ).then(async () => {
          const { data: sequence } = await supabase
            .from('shopify_automation_sequences')
            .select('id')
            .eq('account_id', checkout.account_id)
            .eq('trigger_type', 'cart_abandoned')
            .eq('is_active', true)
            .maybeSingle()
          if (sequence) return { status: 'enqueued' as const }

          return enqueueShopifyNotification(
            supabase,
            checkout.account_id,
            checkout.contact_id,
            checkout.customer_phone || contact?.phone || '',
            'cart_abandoned',
            {
              customer_name: customerFirstName,
              product_name: productName,
              store_name: storeName,
              checkout_url: checkoutUrl,
            }
          )
        })

        if (notifyRes.status === 'enqueued') {
          await supabase
            .from('shopify_checkouts')
            .update({ status: 'abandoned_notified', updated_at: new Date().toISOString() })
            .eq('id', checkout.id)
          
          if (checkout.deal_id) {
            await moveDealToStageName(supabase, checkout.deal_id, 'Nudged / In Recovery', checkout.account_id)
          }
          checkoutsNotified++
        }
        // Leave status=open if nothing is activated so a later toggle/cron can still send.
      }
    }

    // 3) PROCESS THE WHATSAPP SEND JOBS QUEUE
    const now = new Date().toISOString()
    const { data: jobs } = await supabase
      .from('whatsapp_send_jobs')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .lte('run_at', now)
      .order('created_at', { ascending: true })
      .limit(20) // Process in chunks of 20

    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        const nextAttempt = job.attempts + 1

        try {
          // Fetch account context to get owner user ID
          const { data: account } = await supabase
            .from('accounts')
            .select('owner_user_id')
            .eq('id', job.account_id)
            .single()

          const ownerUserId = account?.owner_user_id || job.account_id

          const { data: claimedJob } = await supabase
            .from('whatsapp_send_jobs')
            .update({
              attempts: nextAttempt,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('id', job.id)
            .eq('attempts', job.attempts)
            .in('status', ['pending', 'failed'])
            .select('id')
            .maybeSingle()
          if (!claimedJob) continue

          if (isCartSequenceTemplate(job.template_name || '')) {
            const { data: cartDrip } = await supabase
              .from('shopify_recovery_tracking')
              .select('id')
              .eq('contact_id', job.contact_id)
              .eq('status', 'in_progress')
              .limit(1)
              .maybeSingle()
            if (cartDrip) {
              await supabase
                .from('whatsapp_send_jobs')
                .update({
                  status: 'sent',
                  last_error: 'skipped_sequence_owns_cart_drip',
                  updated_at: new Date().toISOString(),
                } as any)
                .eq('id', job.id)
              continue
            }
          }

          // Find or create conversation
          const conv = await findOrCreateConversation(supabase, {
            accountId: job.account_id,
            userId: ownerUserId,
            contactId: job.contact_id,
          })
          if (!conv) {
            throw new Error('Failed to resolve conversation')
          }

          // Send template message via Meta WhatsApp API
          await engineSendTemplate({
            accountId: job.account_id,
            userId: ownerUserId,
            conversationId: conv.id,
            contactId: job.contact_id,
            templateName: job.template_name,
            params: (job.template_params as string[]) || [],
          })

          // Mark job as sent
          await supabase
            .from('whatsapp_send_jobs')
            .update({
              status: 'sent',
              attempts: nextAttempt,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('id', job.id)

          if (job.workflow_log_id) {
            await supabase
              .from('workflow_logs')
              .update({ status: 'sent' })
              .eq('id', job.workflow_log_id)
          }

          jobsProcessed++
        } catch (err: any) {
          const errMsg = err.message || String(err)
          console.error(`[shopify-cron] error sending WhatsApp template job ${job.id}:`, errMsg)

          const permanent =
            errMsg.includes('contact has no phone') ||
            errMsg.includes('contact not found') ||
            errMsg.includes('#132001')
          const attempts = permanent ? 3 : nextAttempt
          const backoffMinutes = 5 * nextAttempt
          const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

          await supabase
            .from('whatsapp_send_jobs')
            .update({
              status: 'failed',
              attempts,
              last_error: errMsg,
              run_at: nextRunAt,
            } as any)
            .eq('id', job.id)

          if (job.workflow_log_id) {
            await supabase
              .from('workflow_logs')
              .update({ status: 'failed', error_message: errMsg })
              .eq('id', job.workflow_log_id)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      checkoutsNotified,
      jobsProcessed,
    })
  } catch (err: any) {
    console.error('[shopify-cron] internal error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
