import {
  asRecord,
  firstString,
  type TrackingEvent,
} from '@/lib/shiprocket/status'

function nested(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(body[key]) || {}
}

/**
 * Delhivery push webhook (`Shipment` object or `{ Shipment: [...] }`).
 * https://one.delhivery.com/developer-portal
 */
export function parseDelhiveryWebhook(body: unknown): TrackingEvent {
  const root = asRecord(body) || {}
  const shipmentRaw = root.Shipment ?? root.shipment ?? root
  const shipmentList = Array.isArray(shipmentRaw) ? shipmentRaw[0] : shipmentRaw
  const shipment = asRecord(shipmentList) || root
  const statusObj = asRecord(shipment.Status) || asRecord(root.Status) || {}

  const awb = firstString(
    shipment.AWB,
    shipment.awb,
    shipment.Waybill,
    shipment.waybill,
    root.AWB,
    root.waybill,
  )
  const status = firstString(
    statusObj.Status,
    statusObj.status,
    statusObj.StatusType,
    shipment.status,
    root.status,
  )
  const consignee = asRecord(shipment.Consignee) || {}
  const phone = firstString(
    consignee.Phone,
    consignee.phone,
    shipment.phone,
    shipment.Mobile,
    root.phone,
  )
  const channelOrderId = firstString(
    shipment.ReferenceNo,
    shipment.OrderNo,
    shipment.order,
    root.order_id,
    root.ReferenceNo,
  )
  const customerName = firstString(
    consignee.Name,
    consignee.name,
    shipment.consignee_name,
    root.customer_name,
  )

  return {
    awb,
    status,
    courier: firstString(shipment.Courier, root.courier, 'Delhivery') || 'Delhivery',
    phone,
    orderId: firstString(shipment.Order, root.order_id, channelOrderId),
    channelOrderId,
    customerName,
    trackingUrl: awb
      ? `https://www.delhivery.com/track/package/${awb}`
      : '',
    etd: firstString(shipment.ExpectedDeliveryDate, statusObj.StatusDateTime),
    source: 'delhivery',
  }
}

/**
 * AfterShip tracking webhook v2 (`event` + `msg`).
 * Covers Delhivery, Bluedart, DTDC, Xpressbees, India Post, and 1,000+ slugs.
 */
export function parseAftershipWebhook(body: unknown): TrackingEvent {
  const root = asRecord(body) || {}
  const msg = nested(root, 'msg')
  const custom = asRecord(msg.custom_fields) || {}

  const awb = firstString(
    msg.tracking_number,
    root.tracking_number,
    msg.tracking_number_unique,
  )
  const tag = firstString(msg.tag, msg.subtag, root.tag, root.event)
  const slug = firstString(msg.slug, msg.courier_name, 'AfterShip')
  const phone = firstString(
    Array.isArray(msg.smses) ? msg.smses[0] : '',
    msg.customer_phone,
    custom.phone,
    root.phone,
  )
  const channelOrderId = firstString(
    msg.order_id,
    msg.order_number,
    custom.order_id,
    custom.shopify_order_id,
  )

  return {
    awb,
    status: tag,
    courier: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'AfterShip',
    phone,
    orderId: channelOrderId,
    channelOrderId,
    customerName: firstString(msg.customer_name, custom.customer_name),
    trackingUrl: firstString(
      typeof msg.courier_tracking_link === 'string' ? msg.courier_tracking_link : '',
      awb ? `https://www.aftership.com/track/${awb}` : '',
    ),
    etd: firstString(msg.expected_delivery, msg.shipment_delivery_date),
    source: 'aftership',
  }
}
