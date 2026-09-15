import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  enqueueShopifyNotification,
} from '@/lib/shopify/shopify-helper'
import { extractProductTitleFromLineItems } from '@/lib/shopify/product-image'
import { scheduleImmediateWhatsAppJobs } from '@/lib/whatsapp/process-send-jobs'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'
import {
  mapShipmentStatus,
  ndrIdempotencyBucket,
  normalizeChannelOrderId,
  shipmentNotifyTrigger,
  type TrackingEvent,
} from '@/lib/shiprocket/status'

export interface ProcessShipmentResult {
  success: true
  skipped?: boolean
  reason?: string
  milestone?: string
  jobs?: number
  awb?: string
  status?: string
}

async function findShopifyOrder(
  supabase: SupabaseClient,
  accountId: string,
  event: TrackingEvent,
) {
  const orderNumber = normalizeChannelOrderId(event.channelOrderId)
  const candidates = [orderNumber, event.orderId, event.awb].filter(Boolean)

  for (const value of candidates) {
    const { data: byNumber } = await supabase
      .from('shopify_orders')
      .select('id, shopify_order_id, order_number, contact_id, line_items, tracking_url, fulfillment_status, contacts(name, phone, email)')
      .eq('account_id', accountId)
      .eq('order_number', value)
      .maybeSingle()
    if (byNumber) return byNumber

    const { data: byShopifyId } = await supabase
      .from('shopify_orders')
      .select('id, shopify_order_id, order_number, contact_id, line_items, tracking_url, fulfillment_status, contacts(name, phone, email)')
      .eq('account_id', accountId)
      .eq('shopify_order_id', value)
      .maybeSingle()
    if (byShopifyId) return byShopifyId
  }

  if (event.awb) {
    const { data: byAwb } = await supabase
      .from('shopify_orders')
      .select('id, shopify_order_id, order_number, contact_id, line_items, tracking_url, fulfillment_status, contacts(name, phone, email)')
      .eq('account_id', accountId)
      .ilike('tracking_url', `%${event.awb}%`)
      .limit(1)
      .maybeSingle()
    if (byAwb) return byAwb
  }

  return null
}

/**
 * Shared Shiprocket / Delhivery / AfterShip → WhatsApp send path.
 */
export async function processShipmentTrackingEvent(
  event: TrackingEvent,
  opts?: { accountId?: string | null },
): Promise<ProcessShipmentResult> {
  const milestone = mapShipmentStatus(event.status)
  if (milestone === 'skip') {
    return {
      success: true,
      skipped: true,
      reason: 'non_customer_scan',
      awb: event.awb,
      status: event.status,
    }
  }

  const supabase = supabaseAdmin()
  const context = await getShopifyAccountContext(supabase)
  const accountId = opts?.accountId || context.accountId
  const userId = context.userId

  const order = await findShopifyOrder(supabase, accountId, event)
  const linked = order?.contacts
  const contactRow = Array.isArray(linked) ? linked[0] : linked

  const phone =
    toMetaPhone(event.phone) ||
    toMetaPhone(contactRow?.phone) ||
    ''
  const customerName = (
    event.customerName ||
    String(contactRow?.name || 'Customer')
  )
    .split(' ')[0]
    .trim() || 'Customer'

  const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
    email: contactRow?.email || null,
    phone: phone || contactRow?.phone || null,
    first_name: customerName,
  })

  if (!contact?.id || !hasWhatsAppPhone(phone || contact.phone)) {
    return {
      success: true,
      skipped: true,
      reason: 'no_whatsapp_phone',
      milestone,
      awb: event.awb,
      status: event.status,
    }
  }

  const fulfillmentStatus =
    milestone === 'delivered'
      ? 'delivered'
      : milestone === 'ofd'
        ? 'out_for_delivery'
        : milestone === 'ndr'
          ? 'ndr'
          : 'in_transit'

  if (order?.id) {
    await supabase
      .from('shopify_orders')
      .update({
        fulfillment_status: fulfillmentStatus,
        tracking_url: event.trackingUrl || order.tracking_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
  }

  const trigger = shipmentNotifyTrigger(milestone)
  const orderNumber = String(order?.order_number || event.channelOrderId || event.orderId || '')
  const productName = extractProductTitleFromLineItems(order?.line_items)

  const notifyRes = await enqueueShopifyNotification(
    supabase,
    accountId,
    contact.id,
    phone || contact.phone,
    trigger,
    {
      customer_name: customerName,
      order_number: orderNumber,
      product_name: productName,
      tracking_url: event.trackingUrl,
      courier_name: event.courier || event.source,
      awb: event.awb,
      shopify_order_id: String(order?.shopify_order_id || event.channelOrderId || event.awb),
      ndr_bucket: milestone === 'ndr' ? ndrIdempotencyBucket() : undefined,
    },
  )

  scheduleImmediateWhatsAppJobs(notifyRes.jobIds || [])

  await supabase.from('shopify_webhook_logs').insert({
    account_id: accountId,
    topic: `${event.source}/${milestone}`,
    payload: event as unknown as Record<string, unknown>,
    status:
      notifyRes.status === 'error'
        ? 'failed'
        : notifyRes.status === 'skipped_not_activated'
          ? 'skipped_not_activated'
          : 'success',
    error_message: notifyRes.message || null,
  })

  return {
    success: true,
    skipped: notifyRes.jobIds.length === 0,
    reason: notifyRes.message,
    milestone,
    jobs: notifyRes.jobIds.length,
    awb: event.awb,
    status: event.status,
  }
}
