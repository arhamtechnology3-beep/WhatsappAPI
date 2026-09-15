import { describe, expect, it } from 'vitest'
import {
  mapShipmentStatus,
  ndrIdempotencyBucket,
  normalizeChannelOrderId,
  parseShiprocketWebhook,
  shipmentNotifyTrigger,
} from './status'
import { parseAftershipWebhook, parseDelhiveryWebhook } from '@/lib/logistics/adapters'

describe('mapShipmentStatus', () => {
  it('maps pickup / in-transit / OFD / delivered / NDR', () => {
    expect(mapShipmentStatus('PICKED UP')).toBe('in_transit')
    expect(mapShipmentStatus('In Transit')).toBe('in_transit')
    expect(mapShipmentStatus('OUT FOR DELIVERY')).toBe('ofd')
    expect(mapShipmentStatus('OutForDelivery')).toBe('ofd')
    expect(mapShipmentStatus('Delivered')).toBe('delivered')
    expect(mapShipmentStatus('UNDELIVERED')).toBe('ndr')
    expect(mapShipmentStatus('AttemptFail')).toBe('ndr')
  })

  it('skips label creation and RTO', () => {
    expect(mapShipmentStatus('NEW')).toBe('skip')
    expect(mapShipmentStatus('PICKUP GENERATED')).toBe('skip')
    expect(mapShipmentStatus('RTO INITIATED')).toBe('skip')
  })
})

describe('normalizeChannelOrderId', () => {
  it('strips Shopify # and GID', () => {
    expect(normalizeChannelOrderId('#1011')).toBe('1011')
    expect(normalizeChannelOrderId('gid://shopify/Order/7000656052438')).toBe('7000656052438')
  })
})

describe('parseShiprocketWebhook', () => {
  it('reads AWB, status, phone and channel order id', () => {
    const event = parseShiprocketWebhook({
      awb: '123456',
      current_status: 'OUT FOR DELIVERY',
      courier_name: 'Xpressbees',
      customer_phone: '9820368269',
      channel_order_id: '#1011',
    })
    expect(event.source).toBe('shiprocket')
    expect(event.awb).toBe('123456')
    expect(event.courier).toBe('Xpressbees')
    expect(mapShipmentStatus(event.status)).toBe('ofd')
    expect(shipmentNotifyTrigger('ofd')).toBe('shipment_ofd')
  })
})

describe('parseDelhiveryWebhook', () => {
  it('reads nested Shipment + Consignee', () => {
    const event = parseDelhiveryWebhook({
      Shipment: {
        AWB: 'DLV111',
        Status: { Status: 'Dispatched to POD' },
        ReferenceNo: '1011',
        Consignee: { Name: 'Riya', Phone: '9820368269' },
      },
    })
    expect(event.source).toBe('delhivery')
    expect(event.awb).toBe('DLV111')
    expect(event.phone).toBe('9820368269')
    expect(event.channelOrderId).toBe('1011')
    expect(mapShipmentStatus(event.status)).toBe('ofd')
  })
})

describe('parseAftershipWebhook', () => {
  it('maps AfterShip tags used by Bluedart / DTDC / Xpressbees', () => {
    const event = parseAftershipWebhook({
      event: 'tracking_update',
      msg: {
        tag: 'OutForDelivery',
        tracking_number: 'BD999',
        slug: 'bluedart',
        order_id: '1011',
        customer_name: 'Jesal',
      },
    })
    expect(event.source).toBe('aftership')
    expect(event.courier).toBe('Bluedart')
    expect(event.awb).toBe('BD999')
    expect(mapShipmentStatus(event.status)).toBe('ofd')
  })
})

describe('ndrIdempotencyBucket', () => {
  it('is a calendar day', () => {
    expect(ndrIdempotencyBucket(new Date('2026-09-16T10:00:00Z'))).toBe('2026-09-16')
  })
})
