import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { enqueueShopifyNotification } from '@/lib/shopify/shopify-helper'

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
        // Double check safety: verify no order actually exists for this checkout
        const { data: matchingOrder } = await supabase
          .from('shopify_orders')
          .select('id')
          .eq('contact_id', checkout.contact_id)
          .gte('created_at', checkout.created_at)
          .limit(1)
          .maybeSingle()

        if (matchingOrder) {
          // Checkout was recovered but not webhook-synced correctly; mark recovered and skip
          await supabase
            .from('shopify_checkouts')
            .update({ status: 'recovered', updated_at: new Date().toISOString() })
            .eq('id', checkout.id)
          continue
        }

        // Queue the WhatsApp template send job checking rules
        const contact: any = checkout.contacts
        const customerFirstName = contact?.name?.split(' ')[0] || 'Customer'
        
        // Parse product name from line items (first item)
        const lineItems = (checkout.line_items as any[]) || []
        const productName = lineItems[0]?.title || 'your cart items'
        const checkoutUrl = checkout.abandoned_checkout_url || ''
        const storeName = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'Our Store'

        const notifyRes = await enqueueShopifyNotification(
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

        if (notifyRes.status === 'enqueued') {
          // Mark checkout as abandoned_notified
          await supabase
            .from('shopify_checkouts')
            .update({ status: 'abandoned_notified', updated_at: new Date().toISOString() })
            .eq('id', checkout.id)
          checkoutsNotified++
        } else {
          // Mark as expired so it is not processed again in subsequent cron sweeps
          await supabase
            .from('shopify_checkouts')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', checkout.id)
        }
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

          // Find or create conversation
          let { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('account_id', job.account_id)
            .eq('contact_id', job.contact_id)
            .maybeSingle()

          if (!conv) {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                account_id: job.account_id,
                user_id: ownerUserId,
                contact_id: job.contact_id,
              })
              .select('id')
              .single()

            if (convError || !newConv) {
              throw new Error('Failed to resolve conversation: ' + (convError?.message || 'unknown error'))
            }
            conv = newConv
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

          jobsProcessed++
        } catch (err: any) {
          const errMsg = err.message || String(err)
          console.error(`[shopify-cron] error sending WhatsApp template job ${job.id}:`, errMsg)

          // Compute exponential backoff for run_at (5 mins, 10 mins, 15 mins)
          const backoffMinutes = 5 * nextAttempt
          const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

          await supabase
            .from('whatsapp_send_jobs')
            .update({
              status: 'failed',
              attempts: nextAttempt,
              last_error: errMsg,
              run_at: nextRunAt,
            } as any)
            .eq('id', job.id)
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
