import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
  createOrUpdateShopifyDeal,
  initializeCheckoutRecoverySequence,
} from '@/lib/shopify/shopify-helper'

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

  const supabase = supabaseAdmin()

  try {
    const body = await request.json()
    const {
      cart_token,
      name,
      phone,
      email,
      address,
      total_price,
      currency,
      line_items
    } = body

    if (!cart_token) {
      return NextResponse.json(
        { success: false, error: 'cart_token is required' },
        { status: 400, headers: response.headers }
      )
    }

    const { accountId, userId } = await getShopifyAccountContext(supabase)

    const nameParts = (name || 'Customer').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Customer'
    const lastName = nameParts.slice(1).join(' ') || 'Customer'

    // Resolve contact
    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
      email: email || null,
      phone: phone || null,
      first_name: firstName,
      last_name: lastName,
    })

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Could not resolve contact' },
        { status: 400, headers: response.headers }
      )
    }

    const totalPriceNum = parseFloat(total_price || '0')

    // Create deal
    const dealTitle = `Cart - ${contact.name || 'Shopify Customer'}`
    const dealId = await createOrUpdateShopifyDeal(
      supabase,
      accountId,
      userId,
      contact.id,
      cart_token, // shopify_checkout_id
      dealTitle,
      totalPriceNum,
      currency || 'INR'
    )

    // Build checkout url
    const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'divyaprabhafoods.myshopify.com'
    const abandonedUrl = `https://${storeDomain}/cart`

    // Upsert shopify_checkouts
    const { error: upsertErr } = await supabase
      .from('shopify_checkouts')
      .upsert({
        account_id: accountId,
        shopify_checkout_id: cart_token,
        contact_id: contact.id,
        deal_id: dealId,
        customer_phone: phone,
        customer_email: email || null,
        customer_name: contact.name,
        cart_token: cart_token,
        abandoned_checkout_url: abandonedUrl,
        total_price: totalPriceNum,
        currency: currency || 'INR',
        line_items: line_items || [],
        status: 'open',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shopify_checkout_id' })

    if (upsertErr) {
      throw upsertErr
    }

    // Initialize sequence recovery tracking
    await initializeCheckoutRecoverySequence(
      supabase,
      accountId,
      contact.id,
      cart_token,
      new Date().toISOString()
    )

    const jsonRes = NextResponse.json({ success: true }, { headers: response.headers })
    return jsonRes
  } catch (err: any) {
    console.error('[track-checkout] endpoint error:', err)
    const jsonRes = NextResponse.json(
      { success: false, error: err.message || 'Server error tracking checkout' },
      { status: 500, headers: response.headers }
    )
    return jsonRes
  }
}
