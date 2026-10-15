import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  resolvePipelineAndStages,
  enqueueShopifyNotification,
  moveDealToStageName,
} from '@/lib/shopify/shopify-helper'
import {
  withShopifyProductImages,
  extractProductTitleFromLineItems,
  formatItemsSummary,
} from '@/lib/shopify/product-image'
import {
  extractShopifyCustomerIdentity,
  isShopifyCodOrder,
  recoverMissingShopifyPhone,
} from '@/lib/shopify/order-notify'
import { scheduleImmediateWhatsAppJobs } from '@/lib/whatsapp/process-send-jobs'
import { orderCoversCheckout } from '@/lib/shopify/recovery-conversion'
import { enqueueOwnerOrderAlerts, ownerOrderAlertParams } from '@/lib/shopify/owner-order-alert'
import { hasWhatsAppPhone } from '@/lib/whatsapp/phone-utils'
import { extractDpVisitorIdFromOrder, linkVisitorToContact } from '@/lib/visitors/identify'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] orders-create: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''
  const topic = 'orders/create'

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase, request.headers.get("x-shopify-shop-domain"))
    accountId = resolvedAccountId

    // Parse order attributes
    const orderId = String(payload.id)
    const orderNumber = String(payload.order_number)
    const identity = extractShopifyCustomerIdentity(payload)
    const email = identity.email
    let phone = identity.phone
    if (!hasWhatsAppPhone(phone)) {
      phone = (await recoverMissingShopifyPhone(payload)) || phone
    }
    const cartToken = payload.cart_token || null
    const totalPrice = parseFloat(payload.total_price || '0')
    const currency = payload.currency || 'USD'
    const financialStatus = payload.financial_status || null
    const fulfillmentStatus = payload.fulfillment_status || 'unfulfilled'
    let lineItems: unknown = payload.line_items || []
    try {
      lineItems = await withShopifyProductImages(lineItems)
    } catch (err) {
      console.warn(
        '[shopify-webhook] orders-create: product image enrich failed, continuing:',
        err instanceof Error ? err.message : err,
      )
    }

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

    // If no identifiable customer data (no phone, no email), skip processing
    if (!contact) {
      console.warn('[shopify-webhook] orders-create: skipped — no phone or email in payload')
      return NextResponse.json({ success: true, skipped: true })
    }

    // Link browser visitor_id (theme cart attribute dp_visitor_id) → contact
    const dpVisitorId = extractDpVisitorIdFromOrder(payload)
    if (dpVisitorId && contact.phone) {
      const store = await resolveStoreForAccount(supabase, accountId)
      if (store) {
        await linkVisitorToContact(supabase, {
          storeId: store.id,
          organizationId: store.organization_id,
          visitorId: dpVisitorId,
          phone: contact.phone,
          contactId: contact.id,
          source: 'order',
        }).catch((err) =>
          console.warn(
            '[shopify-webhook] orders-create: visitor link failed:',
            err instanceof Error ? err.message : err,
          ),
        )
      }
    }

    // Resolve pipeline stages
    const { pipelineId, wonStageId } = await resolvePipelineAndStages(supabase, accountId, userId)

    // Try to find matching checkout to recover
    let dealId = null

    if (cartToken) {
      const { data: checkout } = await supabase
        .from('shopify_checkouts')
        .select('id, deal_id')
        .eq('cart_token', cartToken)
        .maybeSingle()

      if (checkout) {
        dealId = checkout.deal_id

        // Mark checkout as recovered
        await supabase
          .from('shopify_checkouts')
          .update({ status: 'recovered', updated_at: new Date().toISOString() })
          .eq('id', checkout.id)
      }
    }

    if (!dealId) {
      const { data: openCheckouts } = await supabase
        .from('shopify_checkouts')
        .select('id, deal_id, line_items')
        .eq('contact_id', contact.id)
        .neq('status', 'recovered')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
      const checkout = (openCheckouts || []).find((c) =>
        orderCoversCheckout(payload.line_items, c.line_items),
      )
      if (checkout) {
        dealId = checkout.deal_id
        await supabase
          .from('shopify_checkouts')
          .update({ status: 'recovered', updated_at: new Date().toISOString() })
          .eq('id', checkout.id)
      }
    }

    if (dealId) {
      // Move checkout deal to Cart Recovered stage
      await moveDealToStageName(supabase, dealId, 'Cart Recovered', accountId)
    } else {
      // Look up Order Confirmed stage ID
      const { data: st } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('name', 'Order Confirmed')
        .maybeSingle()

      const initialStageId = st?.id || wonStageId

      // Create a new Won deal directly
      const dealTitle = `Order #${orderNumber} - ${contact.name || 'Shopify Customer'}`
      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          account_id: accountId,
          user_id: userId,
          pipeline_id: pipelineId,
          stage_id: initialStageId,
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

    const isCod = isShopifyCodOrder(payload)

    // Insert shopify_orders
    const { error: orderError } = await supabase
      .from('shopify_orders')
      .upsert({
        account_id: accountId,
        shopify_order_id: orderId,
        contact_id: contact.id,
        deal_id: dealId,
        order_number: orderNumber,
        financial_status: isCod ? 'cod_pending' : financialStatus,
        fulfillment_status: fulfillmentStatus,
        total_price: totalPrice,
        currency,
        line_items: lineItems,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopify_order_id' })

    if (orderError) {
      throw orderError
    }

    const customerFirstName = identity.firstName || contact.name || 'Customer'
    const sendPhone = phone || contact.phone || ''

    const notifyRes = await enqueueShopifyNotification(
      supabase,
      accountId,
      contact.id,
      sendPhone,
      'order_created',
      {
        customer_name: customerFirstName,
        order_number: orderNumber,
        total_price: totalPrice.toFixed(2),
        product_name: extractProductTitleFromLineItems(lineItems),
        items_summary: formatItemsSummary(lineItems),
        is_cod: isCod,
        shopify_order_id: orderId,
      }
    )

    scheduleImmediateWhatsAppJobs(notifyRes.jobIds || [])

    const ownerJobIds = await enqueueOwnerOrderAlerts(supabase, {
      accountId,
      userId,
      shopifyOrderId: orderId,
      params: ownerOrderAlertParams(payload, {
        customerName: [identity.firstName, identity.lastName].filter(Boolean).join(' ') || contact.name,
        phone: sendPhone,
      }),
    })
    scheduleImmediateWhatsAppJobs(ownerJobIds)

    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic,
      payload,
      status: notifyRes.status === 'error' ? 'failed' : (notifyRes.status === 'skipped_not_activated' ? 'skipped_not_activated' : 'success'),
      error_message:
        notifyRes.status === 'skipped_not_activated'
          ? (notifyRes.message || 'skipped_not_activated')
          : (notifyRes.message || null),
    })

    return NextResponse.json({ success: true, jobs: notifyRes.jobIds?.length || 0 })
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
