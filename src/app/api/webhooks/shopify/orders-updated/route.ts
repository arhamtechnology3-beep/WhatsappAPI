import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  enqueueShopifyNotification,
} from '@/lib/shopify/shopify-helper'
import { extractShopifyCustomerIdentity } from '@/lib/shopify/order-notify'
import { scheduleImmediateWhatsAppJobs } from '@/lib/whatsapp/process-send-jobs'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] orders-updated: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  let topic = 'orders/updated'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    const orderId = String(payload.id)
    const orderNumber = String(payload.order_number)
    const identity = extractShopifyCustomerIdentity(payload)
    const email = identity.email
    const phone = identity.phone
    const financialStatus = payload.financial_status || null
    const fulfillmentStatus = payload.fulfillment_status || 'unfulfilled'
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
    
    const acceptsMarketing = identity.acceptsMarketing

    // Resolve contact
    const customerPayload = {
      id: payload.customer?.id,
      email,
      phone,
      first_name: identity.firstName,
      last_name: identity.lastName,
      marketing_opt_in: acceptsMarketing,
    }

    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, customerPayload)

    // Load existing order row to check for status transitions
    const { data: existingOrder } = await supabase
      .from('shopify_orders')
      .select('deal_id, financial_status, fulfillment_status')
      .eq('shopify_order_id', orderId)
      .maybeSingle()

    const dealId = existingOrder?.deal_id

    // Update order row
    const { error: orderError } = await supabase
      .from('shopify_orders')
      .update({
        financial_status: financialStatus,
        fulfillment_status: fulfillmentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('shopify_order_id', orderId)

    if (orderError) {
      throw orderError
    }

    // Handle order cancellation (move deal to lost)
    const isCancelled = payload.cancelled_at !== null || financialStatus === 'voided'
    if (isCancelled && dealId) {
      await supabase
        .from('deals')
        .update({
          status: 'lost',
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId)
    }

    const customerFirstName = identity.firstName || contact?.name || 'Customer'
    const sendPhone = phone || contact?.phone || ''
    let lastStatus: 'success' | 'skipped_not_activated' | 'failed' = 'skipped_not_activated'
    let lastMessage = ''
    const jobIds: string[] = []

    const recordNotify = (res: { status: string; message?: string; jobIds?: string[] }) => {
      if (res.jobIds?.length) jobIds.push(...res.jobIds)
      if (res.status === 'enqueued') lastStatus = 'success'
      if (res.status === 'error') {
        lastStatus = 'failed'
        lastMessage += `${res.message || 'error'}. `
      } else if (res.status === 'skipped_not_activated' && res.message) {
        lastMessage += `${res.message}. `
      }
    }

    if (contact?.id) {
      const notify = (
        trigger: 'order_cancelled' | 'payment_refunded' | 'payment_received' | 'order_delivered' | 'order_fulfilled',
        extra: Record<string, string> = {},
      ) =>
        enqueueShopifyNotification(supabase, accountId, contact.id, sendPhone, trigger, {
          customer_name: customerFirstName,
          order_number: orderNumber,
          shopify_order_id: orderId,
          ...extra,
        })

      const hasBecomeCancelled = isCancelled && existingOrder?.financial_status !== 'voided'
      if (hasBecomeCancelled) {
        recordNotify(await notify('order_cancelled'))
      }

      const isRefunded = financialStatus === 'refunded' || financialStatus === 'partially_refunded'
      const wasRefunded = existingOrder?.financial_status === 'refunded' || existingOrder?.financial_status === 'partially_refunded'
      if (isRefunded && !wasRefunded) {
        recordNotify(await notify('payment_refunded', { total_price: totalPrice.toFixed(2) }))
      }

      if (financialStatus === 'paid' && existingOrder?.financial_status !== 'paid') {
        recordNotify(await notify('payment_received', { total_price: totalPrice.toFixed(2) }))
      }

      if (fulfillmentStatus === 'fulfilled' && existingOrder?.fulfillment_status !== 'fulfilled') {
        recordNotify(await notify('order_fulfilled'))
      }
    }

    scheduleImmediateWhatsAppJobs(jobIds)

    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic,
      payload,
      status: lastStatus,
      error_message: lastMessage || (lastStatus === 'skipped_not_activated' ? 'skipped_not_activated' : null),
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error(`[shopify-webhook] error in ${topic}:`, err)
    if (accountId) {
      await supabase.from('shopify_webhook_logs').insert({
        account_id: accountId,
        topic,
        payload: JSON.parse(rawBody || '{}'),
        status: 'failed',
        error_message: err.message || String(err),
      })
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
