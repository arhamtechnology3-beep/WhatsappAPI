import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseShiprocketWebhook } from '@/lib/shiprocket/status'
import { processShipmentTrackingEvent } from './notify'

/**
 * Shiprocket → Settings → API → Webhooks sends the token as `x-api-key`.
 * Without COURIER_WEBHOOK_TOKEN set every call is rejected: the endpoint
 * would otherwise let anyone trigger customer WhatsApp sends.
 */
export function isCourierWebhookAuthorized(
  headerValue: string | null,
  expected = process.env.COURIER_WEBHOOK_TOKEN?.trim(),
): boolean {
  if (!expected || !headerValue) return false
  const a = Buffer.from(headerValue.trim())
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function handleShiprocketTrackingWebhook(request: Request): Promise<Response> {
  if (!isCourierWebhookAuthorized(request.headers.get('x-api-key'))) {
    console.warn('[courier-webhook] rejected: missing or wrong x-api-key')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id') || searchParams.get('accountId')
    const body = await request.json().catch(() => ({}))
    const event = parseShiprocketWebhook(body)
    const result = await processShipmentTrackingEvent(event, { accountId })
    console.info('[courier-webhook]', {
      awb: event.awb,
      status: event.status,
      channelOrderId: event.channelOrderId,
      skipped: result.skipped ?? false,
      reason: result.reason,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[courier-webhook] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
