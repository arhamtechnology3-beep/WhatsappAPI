import { NextResponse } from 'next/server'
import { fetchShopify } from '@/lib/shopify/shopify-client'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getShopifyAccountContext } from '@/lib/shopify/shopify-helper'
import { getCashfreeClient } from '@/lib/cashfree/cashfree-client'
import crypto from 'crypto'

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
      cart_items,
      customer: { name, email, phone },
      shipping_address, // { address, city, state, zip }
      discount_code
    } = body

    if (!cart_items || !cart_items.length) {
      return NextResponse.json(
        { success: false, error: 'cart_items is required' },
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
        console.warn(`[cashfree-create-order] Discount lookup failed for code ${discount_code}:`, err)
        // Fallback for mock coupon
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

    // 2) Find or create Shopify customer so email & phone are saved on the profile
    let shopifyCustomerId: number | null = null
    try {
      if (phone) {
        const cleanPhone = phone.trim()
        let searchRes = await fetchShopify(`/customers/search.json?query=phone:${encodeURIComponent(cleanPhone)}&limit=1`)
        if (searchRes.customers && searchRes.customers.length > 0) {
          shopifyCustomerId = searchRes.customers[0].id
          const updatePayload: any = {
            customer: { first_name: firstName, last_name: lastName }
          }
          if (email) updatePayload.customer.email = email
          await fetchShopify(`/customers/${shopifyCustomerId}.json`, {
            method: 'PUT',
            body: JSON.stringify(updatePayload)
          }).catch(() => {})
        }
      }
      if (!shopifyCustomerId && email) {
        const searchRes = await fetchShopify(`/customers/search.json?query=email:${encodeURIComponent(email.trim())}&limit=1`)
        if (searchRes.customers && searchRes.customers.length > 0) {
          shopifyCustomerId = searchRes.customers[0].id
        }
      }
      if (!shopifyCustomerId) {
        const createPayload: any = {
          customer: {
            first_name: firstName,
            last_name: lastName,
            phone: phone || undefined,
            email: email || undefined,
            verified_email: !!email,
          }
        }
        const createRes = await fetchShopify('/customers.json', {
          method: 'POST',
          body: JSON.stringify(createPayload)
        })
        if (createRes && createRes.customer) {
          shopifyCustomerId = createRes.customer.id
        }
      }
    } catch (customerErr) {
      console.warn('[cashfree-create-order] Customer find/create failed (non-fatal):', customerErr)
    }

    // 3) Construct Draft Order body
    const draftOrderPayload: any = {
      draft_order: {
        line_items: cart_items.map((item: any) => ({
          variant_id: item.variant_id,
          quantity: item.quantity
        })),
        ...(shopifyCustomerId ? { customer: { id: shopifyCustomerId } } : {}),
        use_customer_default_address: false,
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: shipping_address.address,
          city: shipping_address.city,
          province: shipping_address.state,
          zip: shipping_address.zip,
          phone: phone,
          country: 'India'
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: shipping_address.address,
          city: shipping_address.city,
          province: shipping_address.state,
          zip: shipping_address.zip,
          phone: phone,
          country: 'India'
        },
        tags: 'custom-checkout',
        note_attributes: [
          { name: 'Custom Checkout', value: 'True' },
          { name: 'Payment Method', value: 'cashfree' }
        ]
      }
    }

    if (appliedDiscount) {
      draftOrderPayload.draft_order.applied_discount = appliedDiscount
    }

    // 4) Create Draft Order in Shopify
    const draftRes = await fetchShopify('/draft_orders.json', {
      method: 'POST',
      body: JSON.stringify(draftOrderPayload)
    })

    if (!draftRes || !draftRes.draft_order) {
      throw new Error('Failed to create Draft Order in Shopify')
    }

    const draftOrder = draftRes.draft_order

    // 5) Generate unique internal order_id
    const internalOrderId = `CR-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

    // 6) Get Supabase account context
    const supabase = supabaseAdmin()
    const { accountId } = await getShopifyAccountContext(supabase)

    // 7) Insert pending record into cashfree_orders table
    const { error: dbErr } = await supabase
      .from('cashfree_orders')
      .insert({
        order_id: internalOrderId,
        account_id: accountId,
        cart_snapshot: cart_items,
        customer_details: { name, email, phone },
        shipping_address: shipping_address,
        amount: parseFloat(draftOrder.total_price),
        currency: 'INR',
        status: 'PENDING',
        shopify_draft_order_id: String(draftOrder.id),
        discount_code: discount_code || null
      })

    if (dbErr) {
      throw new Error('Failed to store pending order in database: ' + dbErr.message)
    }

    // 8) Request order creation from Cashfree
    const stableCustomerId = crypto.createHash('sha256').update(phone || email || internalOrderId).digest('hex').substring(0, 32)
    const cashfreeRequest = {
      order_amount: parseFloat(draftOrder.total_price),
      order_currency: 'INR',
      order_id: internalOrderId,
      customer_details: {
        customer_id: stableCustomerId,
        customer_name: name || 'Customer',
        customer_email: email || undefined,
        customer_phone: phone
      },
      order_meta: {
        return_url: `${process.env.APP_BASE_URL}/checkout/return?order_id={order_id}`,
        notify_url: `${process.env.APP_BASE_URL}/api/cashfree/webhook`
      },
      order_note: 'CartRescue custom checkout order'
    }

    const cashfreeInstance = await getCashfreeClient(supabase, accountId)
    const cashfreeRes = await cashfreeInstance.PGCreateOrder(cashfreeRequest)
    if (!cashfreeRes || !cashfreeRes.data || !cashfreeRes.data.payment_session_id) {
      // Mark as failed in DB
      await supabase
        .from('cashfree_orders')
        .update({ status: 'FAILED_TO_INITIATE', updated_at: new Date().toISOString() })
        .eq('order_id', internalOrderId)

      throw new Error('Invalid response from Cashfree SDK')
    }

    const responseData = {
      success: true,
      payment_session_id: cashfreeRes.data.payment_session_id,
      order_id: internalOrderId
    }

    return NextResponse.json(responseData, { headers: response.headers })

  } catch (err: any) {
    console.error('[cashfree-create-order] endpoint error:', err)
    
    // Attempt to parse Cashfree error response if it exists
    const errorMsg = err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : (err.message || 'Server error creating order')

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 200, headers: response.headers }
    )
  }
}
