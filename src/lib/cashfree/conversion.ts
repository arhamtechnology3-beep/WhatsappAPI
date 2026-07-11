import { fetchShopify } from '@/lib/shopify/shopify-client'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function completeOrderConversion(orderId: string, supabase: SupabaseClient) {
  // 1) Fetch the cashfree order record from the database
  const { data: orderRecord, error: fetchErr } = await supabase
    .from('cashfree_orders')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()

  if (fetchErr || !orderRecord) {
    console.error(`[completeOrderConversion] Failed to retrieve cashfree order record for ID ${orderId}:`, fetchErr)
    return { success: false, error: `Order record ${orderId} not found` }
  }

  const draftOrderId = orderRecord.shopify_draft_order_id
  if (!draftOrderId) {
    console.error(`[completeOrderConversion] Order record ${orderId} is missing shopify_draft_order_id`)
    return { success: false, error: 'Missing shopify_draft_order_id on record' }
  }

  try {
    console.log(`[completeOrderConversion] Completing Draft Order ${draftOrderId} for Cashfree Order ${orderId}...`)

    // 2) Complete Draft Order in Shopify (Option A)
    const completeRes = await fetchShopify(`/draft_orders/${draftOrderId}/complete.json`, {
      method: 'PUT',
      body: '{}'
    })

    if (!completeRes || !completeRes.draft_order || !completeRes.draft_order.order_id) {
      throw new Error(`Failed to complete Draft Order ${draftOrderId} in Shopify`)
    }

    const shopifyOrderId = completeRes.draft_order.order_id
    console.log(`[completeOrderConversion] Draft Order completed. Real Order ID: ${shopifyOrderId}`)

    // 3) Retrieve full order details to get tags, order number, and set as paid
    const orderRes = await fetchShopify(`/orders/${shopifyOrderId}.json`)
    if (!orderRes || !orderRes.order) {
      throw new Error(`Failed to fetch created Order ${shopifyOrderId} details`)
    }

    const shopifyOrderNumber = orderRes.order.order_number
    const currentTags = orderRes.order.tags || ''
    const newTags = currentTags 
      ? `${currentTags}, payment_gateway: cashfree` 
      : 'custom-checkout, payment_gateway: cashfree'

    // 4) Mark the order as paid & update tags
    await fetchShopify(`/orders/${shopifyOrderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        order: {
          id: shopifyOrderId,
          financial_status: 'paid',
          tags: newTags
        }
      })
    })

    console.log(`[completeOrderConversion] Shopify Order ${shopifyOrderId} marked as paid with tags`)

    // 5) Update database status to COMPLETED and set converted_shopify_order_id
    const { error: updateErr } = await supabase
      .from('cashfree_orders')
      .update({
        status: 'COMPLETED',
        shopify_order_id: String(shopifyOrderId),
        converted_shopify_order_id: String(shopifyOrderId),
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)

    if (updateErr) {
      console.error(`[completeOrderConversion] Failed to update cashfree_orders to COMPLETED for ${orderId}:`, updateErr)
    } else {
      console.log(`[completeOrderConversion] Status updated to COMPLETED for order ${orderId}`)
    }

    return {
      success: true,
      shopify_order_id: String(shopifyOrderId),
      shopify_order_number: String(shopifyOrderNumber)
    }

  } catch (err: any) {
    const errorMessage = err.message || String(err)
    console.error(`[completeOrderConversion] Failure converting Cashfree Order ${orderId}:`, errorMessage)

    // 6) Update status to PAID_NOT_CONVERTED and save the error message
    const { error: updateErr } = await supabase
      .from('cashfree_orders')
      .update({
        status: 'PAID_NOT_CONVERTED',
        last_error: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)

    if (updateErr) {
      console.error(`[completeOrderConversion] Failed to mark order ${orderId} as PAID_NOT_CONVERTED:`, updateErr)
    }

    // 7) Notify Admin of Shopify conversion failure via WhatsApp Cloud API
    try {
      await notifyAdminOfConversionFailure(orderId, orderRecord.amount, errorMessage, orderRecord.account_id, supabase)
    } catch (notifyErr: any) {
      console.error(`[completeOrderConversion] WhatsApp admin notification failed:`, notifyErr.message || notifyErr)
    }

    // Return failure representation without raising uncaught exceptions (retains HTTP 200 response stability)
    return {
      success: false,
      error: errorMessage
    }
  }
}

async function notifyAdminOfConversionFailure(
  orderId: string,
  amount: number,
  errorMessage: string,
  accountId: string,
  supabase: SupabaseClient
) {
  const adminPhone = process.env.ADMIN_ALERT_PHONE_NUMBER
  if (!adminPhone) {
    console.warn('[notifyAdminOfConversionFailure] ADMIN_ALERT_PHONE_NUMBER env var is not set, skipping WhatsApp alert.')
    return
  }

  // Load the WhatsApp config for metadata and credentials
  const { data: config, error: configError } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (configError || !config) {
    console.warn(`[notifyAdminOfConversionFailure] WhatsApp not configured for account ${accountId}, cannot alert admin.`)
    return
  }

  const accessToken = decrypt(config.access_token)

  await sendTextMessage({
    phoneNumberId: config.phone_number_id,
    accessToken,
    to: adminPhone,
    text: `⚠️ *ALERT: Shopify Conversion Failure* \n\n*Cashfree Order ID:* ${orderId}\n*Amount:* INR ${amount}\n\nThe customer has been charged, but the Shopify Draft Order could not be completed automatically. Please check wacrm database and process this order manually.\n\n*Error:* ${errorMessage}`
  })

  console.log(`[notifyAdminOfConversionFailure] WhatsApp alert sent successfully to admin: ${adminPhone}`)
}
