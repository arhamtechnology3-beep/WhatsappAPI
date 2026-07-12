import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  enqueueShopifyNotification,
} from '@/lib/shopify/shopify-helper'

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
    const email = payload.email || payload.customer?.email || payload.billing_address?.email || null
    const phone = payload.phone || payload.customer?.phone || payload.billing_address?.phone || payload.shipping_address?.phone || null
    const financialStatus = payload.financial_status || null
    const fulfillmentStatus = payload.fulfillment_status || 'unfulfilled'
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
    
    // Resolve contact
    const customerPayload = {
      id: payload.customer?.id,
      email,
      phone,
      first_name: payload.customer?.first_name,
      last_name: payload.customer?.last_name,
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

    const customerFirstName = payload.customer?.first_name || contact.name || 'Customer'
    let lastStatus: 'success' | 'skipped_not_activated' | 'failed' = 'skipped_not_activated'
    let lastMessage = ''

    // 1) Trigger Order Cancelled
    const hasBecomeCancelled = isCancelled && existingOrder?.financial_status !== 'voided'
    if (hasBecomeCancelled) {
      const res = await enqueueShopifyNotification(
        supabase,
        accountId,
        contact.id,
        phone || '',
        'order_cancelled',
        {
          customer_name: customerFirstName,
          order_number: orderNumber,
        }
      )
      if (res.status === 'enqueued') lastStatus = 'success'
      if (res.status === 'error') {
        lastStatus = 'failed'
        lastMessage += `Cancel: ${res.message || 'error'}. `
      }
    }

    // 2) Trigger Refunded
    const isRefunded = financialStatus === 'refunded' || financialStatus === 'partially_refunded'
    const wasRefunded = existingOrder?.financial_status === 'refunded' || existingOrder?.financial_status === 'partially_refunded'
    const hasBecomeRefunded = isRefunded && !wasRefunded
    if (hasBecomeRefunded) {
      const res = await enqueueShopifyNotification(
        supabase,
        accountId,
        contact.id,
        phone || '',
        'payment_refunded',
        {
          customer_name: customerFirstName,
          order_number: orderNumber,
          total_price: totalPrice.toFixed(2),
        }
      )
      if (res.status === 'enqueued') lastStatus = 'success'
      if (res.status === 'error') {
        lastStatus = 'failed'
        lastMessage += `Refund: ${res.message || 'error'}. `
      }
    }

    // 3) Trigger Payment Received (Paid)
    const isPaid = financialStatus === 'paid'
    const wasPaid = existingOrder?.financial_status === 'paid'
    const hasBecomePaid = isPaid && !wasPaid
    if (hasBecomePaid) {
      const res = await enqueueShopifyNotification(
        supabase,
        accountId,
        contact.id,
        phone || '',
        'payment_received',
        {
          customer_name: customerFirstName,
          order_number: orderNumber,
          total_price: totalPrice.toFixed(2),
        }
      )
      if (res.status === 'enqueued') lastStatus = 'success'
      if (res.status === 'error') {
        lastStatus = 'failed'
        lastMessage += `Paid: ${res.message || 'error'}. `
      }
    }

    // 4) Handle order_delivered trigger when fulfillment status transitions to fulfilled
    const hasBecomeFulfilled = fulfillmentStatus === 'fulfilled' && existingOrder?.fulfillment_status !== 'fulfilled'
    if (hasBecomeFulfilled) {
      const res = await enqueueShopifyNotification(
        supabase,
        accountId,
        contact.id,
        phone || '',
        'order_delivered',
        {
          customer_name: customerFirstName,
          order_number: orderNumber,
        }
      )
      if (res.status === 'enqueued') lastStatus = 'success'
      if (res.status === 'error') {
        lastStatus = 'failed'
        lastMessage += `Delivered: ${res.message || 'error'}. `
      }
    }

    // Log success or skipped
    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic,
      payload,
      status: lastStatus === 'failed' ? 'failed' : (lastStatus === 'skipped_not_activated' ? 'skipped_not_activated' : 'success'),
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
