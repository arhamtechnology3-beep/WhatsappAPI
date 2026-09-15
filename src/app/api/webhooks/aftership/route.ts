import { NextResponse } from 'next/server'
import { parseAftershipWebhook } from '@/lib/logistics/adapters'
import { processShipmentTrackingEvent } from '@/lib/logistics/notify'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id') || searchParams.get('accountId')
    const body = await request.json().catch(() => ({}))
    const result = await processShipmentTrackingEvent(parseAftershipWebhook(body), {
      accountId,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[AfterShip Webhook] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
