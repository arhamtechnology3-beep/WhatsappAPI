import { NextResponse } from 'next/server'
import { fetchShopify } from '@/lib/shopify/shopify-client'

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
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
  response.headers.set('Access-Control-Max-Age', '86400')
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  const response = new NextResponse(null, { status: 204 })
  setCorsHeaders(response, origin)
  return response
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const response = new NextResponse()
  setCorsHeaders(response, origin)

  try {
    const body = await request.json()
    const {
      name,
      phone,
      address,
      city,
      state,
      zip,
      payment_method,
      discount_code,
      line_items
    } = body

    if (!line_items || !line_items.length) {
      return NextResponse.json(
        { success: false, error: 'line_items is required' },
        { status: 400, headers: response.headers }
      )
    }

    const nameParts = (name || 'Customer').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Customer'
    const lastName = nameParts.slice(1).join(' ') || 'Customer'

    // 1) Look up discount value if discount code is provided
    let appliedDiscount = null
    if (discount_code) {
      try {
        const lookupRes = await fetchShopify(`/discount_codes/lookup.json?code=${encodeURIComponent(discount_code)}`)
        if (lookupRes && lookupRes.discount_code) {
          const ruleId = lookupRes.discount_code.price_rule_id
          const ruleRes = await fetchShopify(`/price_rules/${ruleId}.json`)
          if (ruleRes && ruleRes.price_rule) {
            const rule = ruleRes.price_rule
            appliedDiscount = {
              title: discount_code,
              description: rule.title || 'Discount',
              value: Math.abs(parseFloat(rule.value)).toString(),
              value_type: rule.value_type === 'percentage' ? 'percentage' : 'fixed_amount',
              amount: Math.abs(parseFloat(rule.value)).toString()
            }
          }
        }
      } catch (err) {
        console.warn(`[create-order] Discount lookup failed for code ${discount_code}:`, err)
        // Fallback for custom or flat mocked discount codes
        if (discount_code.toUpperCase() === 'COUPON100') {
          appliedDiscount = {
            title: 'COUPON100',
            description: 'Mock Coupon 100 Off',
            value: '100.0',
            value_type: 'fixed_amount',
            amount: '100.0'
          }
        }
      }
    }

    // 2) Construct Draft Order body
    const draftOrderPayload = {
      draft_order: {
        line_items: line_items.map((item: any) => ({
          variant_id: item.variant_id,
          quantity: item.quantity
        })),
        use_customer_default_address: false,
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          city: city,
          province: state,
          zip: zip,
          phone: phone,
          country: 'India'
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          city: city,
          province: state,
          zip: zip,
          phone: phone,
          country: 'India'
        },
        tags: 'custom-checkout',
        note_attributes: [
          { name: 'Custom Checkout', value: 'True' },
          { name: 'Payment Method', value: payment_method || 'cod' }
        ]
      }
    }

    if (appliedDiscount) {
      (draftOrderPayload.draft_order as any).applied_discount = appliedDiscount
    }

    // 3) Create Draft Order in Shopify
    const draftRes = await fetchShopify('/draft_orders.json', {
      method: 'POST',
      body: JSON.stringify(draftOrderPayload)
    })

    if (!draftRes || !draftRes.draft_order) {
      throw new Error('Failed to create Draft Order in Shopify')
    }

    const draftOrder = draftRes.draft_order
    let orderResult = null

    // 4) For COD, complete the Draft Order immediately to generate real Order
    if (payment_method === 'cod') {
      const completeRes = await fetchShopify(`/draft_orders/${draftOrder.id}/complete.json`, {
        method: 'PUT',
        body: '{}'
      })
      if (completeRes && completeRes.draft_order && completeRes.draft_order.order_id) {
        // Fetch the completed order details
        const orderId = completeRes.draft_order.order_id
        const orderRes = await fetchShopify(`/orders/${orderId}.json`)
        if (orderRes && orderRes.order) {
          orderResult = {
            id: orderRes.order.id,
            order_number: orderRes.order.order_number,
            name: orderRes.order.name,
            total_price: orderRes.order.total_price
          }
        }
      }
    } else {
      // For prepaid payments, return draft order details (to be completed after gateway payment authorization)
      orderResult = {
        draft_order_id: draftOrder.id,
        invoice_url: draftOrder.invoice_url,
        total_price: draftOrder.total_price
      }
    }

    const jsonRes = NextResponse.json({ success: true, order: orderResult }, { headers: response.headers })
    return jsonRes
  } catch (err: any) {
    console.error('[create-order] endpoint error:', err)
    const jsonRes = NextResponse.json(
      { success: false, error: err.message || 'Server error creating order' },
      { status: 500, headers: response.headers }
    )
    return jsonRes
  }
}
