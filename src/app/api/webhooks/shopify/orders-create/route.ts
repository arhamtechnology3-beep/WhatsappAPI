import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  resolvePipelineAndStages,
  markDealAsWon,
  enqueueShopifyNotification,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] orders-create: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  let topic = 'orders/create'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    // Parse order attributes
    const orderId = String(payload.id)
    const orderNumber = String(payload.order_number)
    const email = payload.email || null
    const phone = payload.phone || payload.customer?.phone || null
    const cartToken = payload.cart_token || null
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
    const financialStatus = payload.financial_status || null
    const fulfillmentStatus = payload.fulfillment_status || 'unfulfilled'
    const lineItems = payload.line_items || []
    
    // Resolve contact
    const customerPayload = {
      id: payload.customer?.id,
      email,
      phone,
      first_name: payload.customer?.first_name,
      last_name: payload.customer?.last_name,
    }

    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, customerPayload)

    // Resolve pipeline stages
    const { pipelineId, wonStageId } = await resolvePipelineAndStages(supabase, accountId, userId)

    // Try to find matching checkout to recover
    let dealId = null
    let checkoutId = null

    if (cartToken) {
      const { data: checkout } = await supabase
        .from('shopify_checkouts')
        .select('id, deal_id')
        .eq('cart_token', cartToken)
        .maybeSingle()

      if (checkout) {
        checkoutId = checkout.id
        dealId = checkout.deal_id

        // Mark checkout as recovered
        await supabase
          .from('shopify_checkouts')
          .update({ status: 'recovered', updated_at: new Date().toISOString() })
          .eq('id', checkout.id)
      }
    }

    // If no deal found via cart token, look for any open checkout for the same contact
    if (!dealId && contact.id) {
      const { data: checkout } = await supabase
        .from('shopify_checkouts')
        .select('id, deal_id')
        .eq('contact_id', contact.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (checkout) {
        checkoutId = checkout.id
        dealId = checkout.deal_id

        await supabase
          .from('shopify_checkouts')
          .update({ status: 'recovered', updated_at: new Date().toISOString() })
          .eq('id', checkout.id)
      }
    }

    if (dealId) {
      // Mark existing deal as Won
      await markDealAsWon(supabase, dealId, wonStageId)
    } else {
      // Create a new Won deal directly
      const dealTitle = `Order #${orderNumber} - ${contact.name || 'Shopify Customer'}`
      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          account_id: accountId,
          user_id: userId,
          pipeline_id: pipelineId,
          stage_id: wonStageId,
          contact_id: contact.id,
          title: dealTitle,
          value: totalPrice,
          currency: currency || 'USD',
          status: 'won',
        })
        .select()
        .single()

      if (!dealError && newDeal) {
        dealId = newDeal.id
      }
    }

    // Insert shopify_orders
    const { error: orderError } = await supabase
      .from('shopify_orders')
      .upsert({
        account_id: accountId,
        shopify_order_id: orderId,
        contact_id: contact.id,
        deal_id: dealId,
        order_number: orderNumber,
        financial_status: financialStatus,
        fulfillment_status: fulfillmentStatus,
        total_price: totalPrice,
        currency,
        line_items: lineItems,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopify_order_id' })

    if (orderError) {
      throw orderError
    }

    // Enqueue order_created (confirmed) notification
    const customerFirstName = payload.customer?.first_name || contact.name || 'Customer'

    const notifyRes = await enqueueShopifyNotification(
      supabase,
      accountId,
      contact.id,
      phone || '',
      'order_created',
      {
        customer_name: customerFirstName,
        order_number: orderNumber,
        total_price: totalPrice.toFixed(2),
      }
    )

    // Log webhook execution
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
