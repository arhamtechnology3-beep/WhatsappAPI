import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getCashfreeClient } from '@/lib/cashfree/cashfree-client'
import { completeOrderConversion } from '@/lib/cashfree/conversion'

// Allow CORS preflight and actual requests from the Shopify storefront domain
function setCorsHeaders(response: NextResponse, origin: string | null) {
  const allowedOrigins = [
    'https://divyaprabhafoods.com',
    'https://divyaprabhafoods.myshopify.com',
    'http://127.0.0.1:9292',
    'http://localhost:3000'
  ]
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  } else {
    response.headers.set('Access-Control-Allow-Origin', 'https://divyaprabhafoods.com')
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
  response.headers.set('Access-Control-Max-Age', '86400')
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  const response = new NextResponse(null, { status: 204 })
  setCorsHeaders(response, origin)
  return response
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ order_id: string }> }
) {
  const origin = request.headers.get('origin')
  const response = new NextResponse()
  setCorsHeaders(response, origin)

  const { order_id } = await params

  if (!order_id) {
    return NextResponse.json(
      { success: false, error: 'order_id parameter is required' },
      { status: 400, headers: response.headers }
    )
  }

  const supabase = supabaseAdmin()

  try {
    // 1) Fetch database record
    const { data: orderRecord, error: dbErr } = await supabase
      .from('cashfree_orders')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle()

    if (dbErr) {
      console.error(`[cashfree-order-status] Database error for ${order_id}:`, dbErr)
      return NextResponse.json(
        { success: false, error: 'Database error checking status' },
        { status: 500, headers: response.headers }
      )
    }

    if (!orderRecord) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404, headers: response.headers }
      )
    }

    // 2) Check database status
    if (orderRecord.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        order_status: 'PAID',
        shopify_order_id: orderRecord.shopify_order_id,
        shopify_order_number: orderRecord.shopify_order_number,
        customer: orderRecord.customer_details,
        shipping_address: orderRecord.shipping_address
      }, { headers: response.headers })
    }

    if (orderRecord.status === 'FAILED') {
      return NextResponse.json({
        success: true,
        order_status: 'FAILED'
      }, { headers: response.headers })
    }

    if (orderRecord.status === 'PAID_NOT_CONVERTED') {
      return NextResponse.json({
        success: true,
        order_status: 'PAID_NOT_CONVERTED'
      }, { headers: response.headers })
    }

    if (orderRecord.status === 'PROCESSING') {
      return NextResponse.json({
        success: true,
        order_status: 'PROCESSING'
      }, { headers: response.headers })
    }

    // 3) Fallback: Fetch order details from Cashfree directly (if webhook is delayed)
    console.log(`[cashfree-order-status] Polling Cashfree directly for order ${order_id}`)
    const cashfreeInstance = await getCashfreeClient(supabase, orderRecord.account_id)
    const cashfreeRes = await cashfreeInstance.PGFetchOrder(order_id)
    if (!cashfreeRes || !cashfreeRes.data) {
      throw new Error('No response data from Cashfree API')
    }

    const cashfreeOrder = cashfreeRes.data
    console.log(`[cashfree-order-status] Cashfree returned status: ${cashfreeOrder.order_status} for ${order_id}`)

    // 4) If payment is success in Cashfree, attempt to claim lock and convert order
    if (cashfreeOrder.order_status === 'PAID') {
      // Claim lock atomically to prevent duplicate conversions
      const { data: claimedRows, error: claimErr } = await supabase
        .from('cashfree_orders')
        .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
        .eq('order_id', order_id)
        .eq('status', 'PENDING')
        .select()

      if (claimErr) {
        console.error(`[cashfree-order-status] Error claiming PROCESSING lock for order ${order_id}:`, claimErr)
        return NextResponse.json({ success: false, error: 'Database lock error' }, { status: 500, headers: response.headers })
      }

      if (claimedRows && claimedRows.length > 0) {
        // This poll thread claimed the lock! Complete the conversion synchronously.
        console.log(`[cashfree-order-status] Lock claimed by poll thread for order ${order_id}. Completing conversion...`)
        const conversionResult = await completeOrderConversion(order_id, supabase)
        
        if (conversionResult.success) {
          return NextResponse.json({
            success: true,
            order_status: 'PAID',
            shopify_order_id: conversionResult.shopify_order_id,
            shopify_order_number: conversionResult.shopify_order_number,
            customer: orderRecord.customer_details,
            shipping_address: orderRecord.shipping_address
          }, { headers: response.headers })
        } else {
          return NextResponse.json({
            success: true,
            order_status: 'PAID_NOT_CONVERTED'
          }, { headers: response.headers })
        }
      } else {
        // Lock not claimed. Re-query database to check if another thread completed it
        const { data: reQueryOrder } = await supabase
          .from('cashfree_orders')
          .select('*')
          .eq('order_id', order_id)
          .maybeSingle()

        if (reQueryOrder) {
          if (reQueryOrder.status === 'COMPLETED') {
            return NextResponse.json({
              success: true,
              order_status: 'PAID',
              shopify_order_id: reQueryOrder.shopify_order_id,
              shopify_order_number: reQueryOrder.shopify_order_number,
              customer: reQueryOrder.customer_details,
              shipping_address: reQueryOrder.shipping_address
            }, { headers: response.headers })
          } else if (reQueryOrder.status === 'PAID_NOT_CONVERTED') {
            return NextResponse.json({
              success: true,
              order_status: 'PAID_NOT_CONVERTED'
            }, { headers: response.headers })
          } else if (reQueryOrder.status === 'PROCESSING') {
            return NextResponse.json({
              success: true,
              order_status: 'PROCESSING'
            }, { headers: response.headers })
          }
        }
      }
    } else if (cashfreeOrder.order_status === 'EXPIRED' || cashfreeOrder.order_status === 'TERMINATED') {
      // Update database status to FAILED if it was PENDING
      await supabase
        .from('cashfree_orders')
        .update({
          status: 'FAILED',
          updated_at: new Date().toISOString()
        })
        .eq('order_id', order_id)
        .eq('status', 'PENDING')

      return NextResponse.json({
        success: true,
        order_status: 'FAILED'
      }, { headers: response.headers })
    }

    // Default status
    return NextResponse.json({
      success: true,
      order_status: cashfreeOrder.order_status || 'PENDING'
    }, { headers: response.headers })

  } catch (err: any) {
    console.error(`[cashfree-order-status] Status check failed for order ${order_id}:`, err.message || err)
    
    const errorMsg = err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : (err.message || 'Error checking payment status')

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500, headers: response.headers }
    )
  }
}
