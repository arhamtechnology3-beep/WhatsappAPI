import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchShiprocketShipment, type LiveShipment } from '@/lib/shiprocket/client'
import { fetchShopify } from '@/lib/shopify/shopify-client'
import {
  awbFromTrackingUrl,
  trackingNumberOf,
  type ShopifyOrderLike,
} from '@/lib/shopify/shopify-order-lookup'
import {
  fulfillmentTrackingNumber,
  fulfillmentTrackingUrl,
  latestFulfillment,
  type ShopifyFulfillmentLike,
} from '@/lib/shopify/fulfillment-tracking'
import { enqueueShopifyNotification } from '@/lib/shopify/shopify-helper'
import { scheduleImmediateWhatsAppJobs } from '@/lib/whatsapp/process-send-jobs'
import {
  isPastExpectedDelivery,
  stageFromCourierStatus,
  type OrderStage,
} from '@/lib/orders/order-stage'
import { processShipmentTrackingEvent } from './notify'

/** The tick runs every minute; courier polling only needs a few times a day. */
const SWEEP_INTERVAL_MS = 2 * 60 * 60 * 1000
/** Scans older than this sync silently — no "out for delivery" a day late. */
const NOTIFY_FRESHNESS_MS = 24 * 60 * 60 * 1000
const LOOKBACK_DAYS = 30
const OPEN_STATUSES = ['fulfilled', 'partial', 'in_transit', 'out_for_delivery', 'ndr']

let lastSweepAt = 0
const flaggedToday = new Set<string>()

export interface ShipmentSweepResult {
  skipped?: 'throttled'
  checked: number
  updated: number
  delayed: number
}

const STAGE_TO_LOCAL: Partial<Record<OrderStage, string>> = {
  in_transit: 'in_transit',
  ofd: 'out_for_delivery',
  ndr: 'ndr',
  delivered: 'delivered',
}

const STAGE_TO_EVENT_STATUS: Partial<Record<OrderStage, string>> = {
  in_transit: 'In Transit',
  ofd: 'Out For Delivery',
  ndr: 'Undelivered',
  delivered: 'Delivered',
}

/** "2026-10-09 15:45:35" (IST, no zone) → epoch ms. */
function istTimestamp(raw: string): number {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return NaN
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+05:30`)
}

/** Current AWB on Shopify — changes when the courier is re-booked. */
async function shopifyTracking(
  shopifyOrderId: string,
): Promise<{ awb: string; url: string }> {
  try {
    const res = await fetchShopify(`/orders/${shopifyOrderId}.json`)
    const order = (res?.order || {}) as ShopifyOrderLike & { fulfillments?: ShopifyFulfillmentLike[] }
    const current = latestFulfillment(order.fulfillments)
    return {
      awb: fulfillmentTrackingNumber(current) || trackingNumberOf(order),
      url: fulfillmentTrackingUrl(current),
    }
  } catch {
    return { awb: '', url: '' }
  }
}

/**
 * Live Shiprocket status for the order. A stored AWB that Shiprocket no
 * longer tracks (cancelled on re-booking) falls back to Shopify's current
 * AWB, which is saved so the next sweep uses it directly.
 */
async function liveShipmentForOrder(
  db: SupabaseClient,
  row: { account_id: string; shopify_order_id: string; tracking_url: string | null },
): Promise<{ awb: string; live: LiveShipment } | null> {
  const storedAwb = awbFromTrackingUrl(row.tracking_url)
  if (storedAwb) {
    const live = await fetchShiprocketShipment(db, row.account_id, storedAwb)
    if (live?.status) return { awb: storedAwb, live }
  }

  const current = await shopifyTracking(row.shopify_order_id)
  if (!current.awb || current.awb === storedAwb) return null
  const live = await fetchShiprocketShipment(db, row.account_id, current.awb)
  if (!live?.status) return null

  const url = live.trackUrl || current.url
  if (url && url !== row.tracking_url) {
    await db
      .from('shopify_orders')
      .update({ tracking_url: url, updated_at: new Date().toISOString() })
      .eq('account_id', row.account_id)
      .eq('shopify_order_id', row.shopify_order_id)
  }
  return { awb: current.awb, live }
}

async function flagDelay(
  db: SupabaseClient,
  row: {
    account_id: string
    shopify_order_id: string
    order_number: string
    contact_id: string | null
    contacts: { name?: string | null; phone?: string | null } | null
  },
  live: LiveShipment,
): Promise<void> {
  if (!row.contact_id) return
  const flagKey = `${row.shopify_order_id}:${new Date().toISOString().slice(0, 10)}`
  if (flaggedToday.has(flagKey)) return
  flaggedToday.add(flagKey)
  // Surface the chat to the team whether or not the template is approved.
  await db
    .from('conversations')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('contact_id', row.contact_id)
    .eq('account_id', row.account_id)

  const { data: template } = await db
    .from('message_templates')
    .select('status')
    .eq('account_id', row.account_id)
    .eq('name', 'wacrm_order_delayed_v1')
    .limit(1)
    .maybeSingle()
  if (String(template?.status || '').toUpperCase() !== 'APPROVED') return

  const res = await enqueueShopifyNotification(
    db,
    row.account_id,
    row.contact_id,
    row.contacts?.phone || '',
    'shipment_delayed',
    {
      customer_name: String(row.contacts?.name || 'Customer').split(' ')[0],
      order_number: row.order_number,
      courier_name: live.courier || 'Courier partner',
      shopify_order_id: row.shopify_order_id,
    },
  )
  scheduleImmediateWhatsAppJobs(res.jobIds)
}

/**
 * Poll Shiprocket for every open shipment: keeps shopify_orders in sync
 * when the Shiprocket webhook is missing, sends fresh milestones
 * (out for delivery / delivered / NDR) and flags parcels past their
 * expected delivery date.
 */
export async function sweepOpenShipments(
  db: SupabaseClient,
  opts: { force?: boolean; now?: Date } = {},
): Promise<ShipmentSweepResult> {
  const now = opts.now ?? new Date()
  if (!opts.force && now.getTime() - lastSweepAt < SWEEP_INTERVAL_MS) {
    return { skipped: 'throttled', checked: 0, updated: 0, delayed: 0 }
  }
  lastSweepAt = now.getTime()

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data: rows } = await db
    .from('shopify_orders')
    .select('account_id, shopify_order_id, order_number, contact_id, tracking_url, fulfillment_status, contacts(name, phone)')
    .in('fulfillment_status', OPEN_STATUSES)
    .gte('created_at', since)
    .limit(200)

  const result: ShipmentSweepResult = { checked: 0, updated: 0, delayed: 0 }
  for (const raw of rows || []) {
    const row = raw as unknown as Parameters<typeof flagDelay>[1] & {
      tracking_url: string | null
      fulfillment_status: string | null
    }
    const found = await liveShipmentForOrder(db, row)
    if (!found) continue
    const { awb, live } = found
    result.checked++

    const stage = stageFromCourierStatus(live.status)
    const local = stage ? STAGE_TO_LOCAL[stage] : undefined
    const eventStatus = stage ? STAGE_TO_EVENT_STATUS[stage] : undefined
    if (local && eventStatus && local !== row.fulfillment_status) {
      const fresh = now.getTime() - istTimestamp(live.lastActivityAt) < NOTIFY_FRESHNESS_MS
      await processShipmentTrackingEvent(
        {
          awb,
          status: eventStatus,
          courier: live.courier,
          phone: '',
          orderId: '',
          channelOrderId: row.order_number,
          customerName: '',
          trackingUrl: live.trackUrl,
          etd: live.edd,
          source: 'shiprocket_poll',
        },
        { accountId: row.account_id, notify: fresh },
      )
      result.updated++
    }

    if (stage && isPastExpectedDelivery(stage, live.edd, now)) {
      await flagDelay(db, row, live)
      result.delayed++
    }
  }
  return result
}
