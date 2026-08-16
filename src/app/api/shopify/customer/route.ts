import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchShopify } from '@/lib/shopify/shopify-client'
import {
  searchShopifyCustomers,
  pickPreferredShopifyCustomer,
  type ShopifyCustomerHit,
} from '@/lib/shopify/shopify-customer-lookup'

interface ShopifyCustomer {
  id: number | string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  orders_count: number
  total_spent: string
  currency: string
  default_address?: Record<string, unknown>
}

interface ShopifyOrder {
  id: number | string
  name: string
  order_number: number
  created_at: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  line_items: Array<{
    id: number | string
    title: string
    quantity: number
    price: string
  }>
}

export async function GET(request: Request) {
  try {
    // Authenticate the user and resolve the account context
    const ctx = await getCurrentAccount()
    
    // Extract contact ID and optional details from query params
    const { searchParams } = new URL(request.url)
    const contactId = searchParams.get('contactId')

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: 'contactId query parameter is required' },
        { status: 400 }
      )
    }

    // 1) Fetch the contact from database to check for cached shopify_customer_id
    const { data: contact, error: contactError } = await ctx.supabase
      .from('contacts')
      .select('id, shopify_customer_id, phone, email')
      .eq('id', contactId)
      .maybeSingle()

    if (contactError) {
      throw contactError
    }

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      )
    }

    let customer: ShopifyCustomer | null = null
    const matches: ShopifyCustomerHit[] = []
    const customerId = contact.shopify_customer_id

    if (customerId) {
      try {
        const customerRes = await fetchShopify(`/customers/${customerId}.json`)
        if (customerRes.customer) {
          customer = customerRes.customer as ShopifyCustomer
          matches.push(customerRes.customer as ShopifyCustomerHit)
        }
      } catch (e) {
        console.warn(`[shopify-customer] Failed to fetch customer by ID ${customerId}:`, e)
      }
    }

    const searched = await searchShopifyCustomers({
      phone: contact.phone,
      email: contact.email,
    })
    for (const row of searched) {
      if (!matches.some((m) => String(m.id) === String(row.id))) {
        matches.push(row)
      }
    }
    const preferred = pickPreferredShopifyCustomer(matches)
    if (preferred) {
      customer = {
        ...(customer || {}),
        ...preferred,
      } as ShopifyCustomer
    }

    if (customer && String(contact.shopify_customer_id || '') !== String(customer.id)) {
      try {
        await ctx.supabase
          .from('contacts')
          .update({ shopify_customer_id: String(customer.id) })
          .eq('id', contact.id)
      } catch (dbErr) {
        console.error('[shopify-customer] Failed to cache shopify_customer_id in DB:', dbErr)
      }
    }

    const orderById = new Map<string, ShopifyOrder>()
    for (const hit of matches.length ? matches : customer ? [customer] : []) {
      try {
        const ordersRes = await fetchShopify(`/customers/${hit.id}/orders.json?status=any`)
        for (const o of (ordersRes.orders || []) as ShopifyOrder[]) {
          orderById.set(String(o.id), o)
        }
      } catch (e) {
        console.error(`[shopify-customer] Failed to fetch orders for Shopify customer ID ${hit.id}:`, e)
      }
    }
    const orders = [...orderById.values()]

    return NextResponse.json({
      success: true,
      customer: customer ? {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        orders_count: orders.length || customer.orders_count,
        total_spent: customer.total_spent,
        currency: customer.currency,
        default_address: customer.default_address,
      } : null,
      orders: orders.map(o => ({
        id: o.id,
        name: o.name,
        order_number: o.order_number,
        created_at: o.created_at,
        total_price: o.total_price,
        currency: o.currency,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        line_items: (o.line_items || []).map(li => ({
          id: li.id,
          title: li.title,
          quantity: li.quantity,
          price: li.price,
        }))
      }))
    })

  } catch (err: unknown) {
    console.error('[shopify-customer] endpoint error:', err)
    return toErrorResponse(err)
  }
}
