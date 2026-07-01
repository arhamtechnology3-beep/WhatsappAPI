import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  enqueueShopifyNotification,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] fulfillments-create: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  let topic = 'fulfillments/create'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    const shopifyOrderId = String(payload.order_id)
    const trackingUrl = payload.tracking_url || payload.tracking_urls?.[0] || null
    const trackingCompany = payload.tracking_company || 'Courier'
    const trackingNumber = payload.tracking_number || ''

    // Find the associated order
    const { data: order } = await supabase
      .from('shopify_orders')
      .select('id, contact_id, order_number, contacts(name, first_name, phone)')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle()

    if (!order) {
      console.warn(`[shopify-webhook] fulfillments-create: order ${shopifyOrderId} not found in DB`)
      return NextResponse.json({ success: true, message: 'Order not found, skipped notification' })
    }

    // Update the shopify_orders row
    await supabase
      .from('shopify_orders')
      .update({
        fulfillment_status: 'fulfilled',
        tracking_url: trackingUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    // Enqueue order_fulfilled WhatsApp Send Job
    const contact: any = order.contacts
    const customerFirstName = contact?.first_name || contact?.name || 'Customer'
    const orderNumber = order.order_number || ''
    const phone = contact?.phone || ''

    let notifyRes: { status: 'enqueued' | 'skipped_not_activated' | 'error'; message?: string } = {
      status: 'skipped_not_activated',
      message: undefined,
    }

    if (order.contact_id) {
      const res = await enqueueShopifyNotification(
        supabase,
        accountId,
        order.contact_id,
        phone,
        'order_fulfilled',
        {
          customer_name: customerFirstName,
          order_number: orderNumber,
          tracking_url: trackingUrl || 'Not Available',
        }
      )
      notifyRes = { status: res.status, message: res.message }
    }

    // Log success or skipped
    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic,
      payload,
      status: notifyRes.status === 'error' ? 'failed' : (notifyRes.status === 'skipped_not_activated' ? 'skipped_not_activated' : 'success'),
      error_message: notifyRes.status === 'skipped_not_activated' ? 'skipped_not_activated' : (notifyRes.message || null),
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
