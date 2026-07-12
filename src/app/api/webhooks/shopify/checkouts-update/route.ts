import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  createOrUpdateShopifyDeal,
  initializeCheckoutRecoverySequence,
  moveDealToStageName,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] checkouts-update: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  let topic = 'checkouts/update'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    // Parse checkout attributes
    const checkoutId = payload.id ? String(payload.id) : (payload.token ? String(payload.token) : null)

    if (!checkoutId) {
      console.warn('[shopify-webhook] checkouts-update: skipped — no checkout id or token in payload')
      return NextResponse.json({ success: true, skipped: true })
    }

    const email = payload.email || payload.customer?.email || payload.billing_address?.email || null
    const phone = payload.phone || payload.customer?.phone || payload.billing_address?.phone || payload.shipping_address?.phone || null
    const firstName = payload.customer?.first_name || payload.billing_address?.first_name || payload.shipping_address?.first_name || null
    const lastName = payload.customer?.last_name || payload.billing_address?.last_name || payload.shipping_address?.last_name || null
    const name = [firstName, lastName].filter(Boolean).join(' ') || payload.billing_address?.name || null
    const cartToken = payload.cart_token || null
    const abandonedUrl = payload.abandoned_checkout_url || null
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
    const lineItems = payload.line_items || []
    
    const acceptsMarketing = 
      payload.customer?.sms_marketing_consent?.state === 'subscribed' ||
      payload.customer?.sms_marketing_consent?.state === 'opt_in' ||
      payload.buyer_accepts_marketing === true ||
      payload.customer?.accepts_marketing === true

    // Resolve contact
    const customerPayload = {
      id: payload.customer?.id,
      email,
      phone,
      first_name: firstName,
      last_name: lastName,
      marketing_opt_in: acceptsMarketing,
    }

    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, customerPayload)

    // If no identifiable customer data (no phone, no email), skip processing
    if (!contact) {
      console.warn('[shopify-webhook] checkouts-update: skipped — no phone or email in payload')
      return NextResponse.json({ success: true, skipped: true })
    }

    // Update deal
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
    // If the checkout is already recovered or abandoned_notified, keep its status unless it's open
    const { data: existing } = await supabase
      .from('shopify_checkouts')
      .select('status')
      .eq('shopify_checkout_id', checkoutId)
      .maybeSingle()

    const isCompleted = !!payload.completed_at
    const status = isCompleted ? 'recovered' : (existing?.status || 'open')

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
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopify_checkout_id' })

    if (upsertErr) {
      throw upsertErr
    }

    // If the checkout was completed/recovered, update tracking status to converted
    if (isCompleted) {
      const { data: checkoutRow } = await supabase
        .from('shopify_checkouts')
        .select('id')
        .eq('shopify_checkout_id', checkoutId)
        .maybeSingle()

      if (checkoutRow) {
        await supabase
          .from('shopify_recovery_tracking')
          .update({ status: 'converted', updated_at: new Date().toISOString() })
          .eq('shopify_checkout_id', checkoutRow.id)
          .eq('status', 'in_progress')
      }

      if (dealId) {
        await moveDealToStageName(supabase, dealId, 'Cart Recovered', accountId)
      }
    } else {
      // Initialize sequence recovery tracking (will early-exit if already tracking)
      await initializeCheckoutRecoverySequence(
        supabase,
        accountId,
        contact.id,
        checkoutId,
        payload.created_at || new Date().toISOString()
      )
    }

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
