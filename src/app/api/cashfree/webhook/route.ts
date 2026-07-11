import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { cashfree } from '@/lib/cashfree/cashfree-client'
import { completeOrderConversion } from '@/lib/cashfree/conversion'

export async function POST(request: Request) {
  const signature = request.headers.get('x-webhook-signature')
  const timestamp = request.headers.get('x-webhook-timestamp')

  if (!signature || !timestamp) {
    return new NextResponse('Missing signature or timestamp headers', { status: 400 })
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (readErr) {
    console.error('[cashfree-webhook] Failed to read raw body:', readErr)
    return new NextResponse('Failed to read request body', { status: 400 })
  }

  // Parse webhook payload locally first to retrieve metadata for logging
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch (parseErr) {
    console.error('[cashfree-webhook] Failed to parse JSON body:', parseErr)
    return new NextResponse('Invalid JSON body', { status: 400 })
  }

  const eventType = payload.type
  const orderId = payload.data?.order?.order_id

  if (!orderId) {
    console.warn('[cashfree-webhook] Missing order_id in payload data')
    return NextResponse.json({ success: true, message: 'Missing order_id, ignored' })
  }

  // 1) Verify signature BEFORE any DB read/write or Shopify call
  try {
    cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp)
    console.log(`[cashfree-webhook] Webhook signature verified successfully for Order ${orderId}`)
  } catch (err: any) {
    // Webhook Signature Failure Log Path: Logs event type + order ID, but avoids full PII/secrets.
    console.error(`[cashfree-webhook] [SIGNATURE FAILURE] Signature mismatch. Event: ${eventType}, Order ID: ${orderId}. Error: ${err.message}`)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  console.log(`[cashfree-webhook] Processing Event: ${eventType}, Internal Order ID: ${orderId}`)

  const supabase = supabaseAdmin()

  try {
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      const paymentStatus = payload.data?.payment?.payment_status
      if (paymentStatus !== 'SUCCESS') {
        console.warn(`[cashfree-webhook] Success event received but payment status was ${paymentStatus}`)
        return NextResponse.json({ success: true, message: 'Payment status not success' })
      }

      // 2) Atomic status transition: Attempt to claim PROCESSING lock
      // Single UPDATE WHERE status = 'PENDING' is guaranteed atomic by Postgres row-level locks.
      const { data: claimedRows, error: claimErr } = await supabase
        .from('cashfree_orders')
        .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('status', 'PENDING')
        .select()

      if (claimErr) {
        console.error(`[cashfree-webhook] Error claiming PROCESSING lock for order ${orderId}:`, claimErr)
        return new NextResponse('Database lock error', { status: 500 })
      }

      // If no row was updated, it means another thread (like concurrent webhook retry or order-status polling)
      // already claimed the lock and transitioned status to PROCESSING, COMPLETED, or PAID_NOT_CONVERTED.
      if (!claimedRows || claimedRows.length === 0) {
        console.log(`[cashfree-webhook] Lock claim returned 0 rows for order ${orderId}. Already processed or processing. Returning 200 immediately.`)
        return NextResponse.json({ success: true, message: 'Already processed or processing' })
      }

      console.log(`[cashfree-webhook] Lock claimed successfully for order ${orderId}. Transitioning to Shopify order...`)

      // 3) Complete Draft Order conversion using the shared utility function
      const conversionResult = await completeOrderConversion(orderId, supabase)

      return NextResponse.json(conversionResult)

    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      console.log(`[cashfree-webhook] Payment failed or dropped for order ${orderId}. Event type: ${eventType}`)

      // Update status to FAILED if it was PENDING
      const { error: updateErr } = await supabase
        .from('cashfree_orders')
        .update({
          status: 'FAILED',
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId)
        .eq('status', 'PENDING')

      if (updateErr) {
        console.error(`[cashfree-webhook] Failed to update status to FAILED for order ${orderId}:`, updateErr)
      }
    } else {
      console.log(`[cashfree-webhook] Unhandled webhook event type: ${eventType}`)
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error(`[cashfree-webhook] Error processing webhook for order ${orderId}:`, err.message || err)
    return new NextResponse('Webhook processing error', { status: 500 })
  }
}
