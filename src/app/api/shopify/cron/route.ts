import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { enqueueShopifyNotification, initializeCheckoutRecoverySequence, moveDealToStageName } from '@/lib/shopify/shopify-helper'
import { authorizeCron } from '@/lib/cron/auth'
import { customerStoreName, toCustomerStoreUrl } from '@/lib/shopify/storefront-url'
import { processWhatsAppSendJobs } from '@/lib/whatsapp/process-send-jobs'

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
        const checkoutUrl = toCustomerStoreUrl(checkout.abandoned_checkout_url)
        const storeName = customerStoreName()

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
    const sendResult = await processWhatsAppSendJobs({ supabase, limit: 20 })
    jobsProcessed = sendResult.processed

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
