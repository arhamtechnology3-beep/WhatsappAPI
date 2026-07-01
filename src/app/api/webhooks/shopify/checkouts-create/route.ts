import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  createOrUpdateShopifyDeal,
  initializeCheckoutRecoverySequence,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] checkouts-create: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  let topic = 'checkouts/create'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    // Parse checkout attributes
    const checkoutId = String(payload.id)
    const email = payload.email || null
    const phone = payload.phone || payload.customer?.phone || null
    const name = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(' ') || payload.billing_address?.name || null
    const cartToken = payload.cart_token || null
    const abandonedUrl = payload.abandoned_checkout_url || null
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
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

    // Create deal
    const dealTitle = `Cart - ${contact.name || 'Shopify Customer'}`
    const dealId = await createOrUpdateShopifyDeal(
      supabase,
      accountId,
      userId,
      contact.id,
      checkoutId,
      dealTitle,
      totalPrice,
      currency
    )

    // Upsert shopify_checkouts
    const { error: upsertErr } = await supabase
      .from('shopify_checkouts')
      .upsert({
        account_id: accountId,
        shopify_checkout_id: checkoutId,
        contact_id: contact.id,
        deal_id: dealId,
        customer_phone: phone,
        customer_email: email,
        customer_name: contact.name,
        cart_token: cartToken,
        abandoned_checkout_url: abandonedUrl,
        total_price: totalPrice,
        currency,
        line_items: lineItems,
        status: 'open',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopify_checkout_id' })

    if (upsertErr) {
      throw upsertErr
    }

    // Initialize sequence recovery tracking
    await initializeCheckoutRecoverySequence(
      supabase,
      accountId,
      contact.id,
      checkoutId,
      payload.created_at || new Date().toISOString()
    )

    // Log success
    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic,
      payload,
      status: 'success',
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
