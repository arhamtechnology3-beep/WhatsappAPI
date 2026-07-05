import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchShopify } from '@/lib/shopify/shopify-client'

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
    const customerId = contact.shopify_customer_id

    // 2) Fetch customer by ID if cached
    if (customerId) {
      try {
        const customerRes = await fetchShopify(`/customers/${customerId}.json`)
        customer = customerRes.customer as ShopifyCustomer
      } catch (e) {
        console.warn(`[shopify-customer] Failed to fetch customer by ID ${customerId}:`, e)
      }
    }

    // 3) Fallback search by phone number (if not found by ID)
    if (!customer && contact.phone) {
      try {
        const cleanPhone = contact.phone.trim()
        // Try exact phone search
        let searchRes = await fetchShopify(`/customers/search.json?query=phone:${encodeURIComponent(cleanPhone)}`)
        if (searchRes.customers && searchRes.customers.length > 0) {
          customer = searchRes.customers[0] as ShopifyCustomer
        } else if (cleanPhone.startsWith('+')) {
          // Try search without the leading '+' symbol
          const rawPhone = cleanPhone.replace('+', '')
          searchRes = await fetchShopify(`/customers/search.json?query=phone:${encodeURIComponent(rawPhone)}`)
          if (searchRes.customers && searchRes.customers.length > 0) {
            customer = searchRes.customers[0] as ShopifyCustomer
          }
        }
      } catch (e) {
        console.warn(`[shopify-customer] Failed to search customer by phone ${contact.phone}:`, e)
      }
    }

    // 4) Fallback search by email (if not found by ID or phone)
    if (!customer && contact.email) {
      try {
        const cleanEmail = contact.email.trim()
        const searchRes = await fetchShopify(`/customers/search.json?query=email:${encodeURIComponent(cleanEmail)}`)
        if (searchRes.customers && searchRes.customers.length > 0) {
          customer = searchRes.customers[0] as ShopifyCustomer
        }
      } catch (e) {
        console.warn(`[shopify-customer] Failed to search customer by email ${contact.email}:`, e)
      }
    }

    // 5) If customer was found and ID is not cached, update the database
    if (customer && !contact.shopify_customer_id) {
      try {
        await ctx.supabase
          .from('contacts')
          .update({ shopify_customer_id: String(customer.id) })
          .eq('id', contact.id)
      } catch (dbErr) {
        console.error('[shopify-customer] Failed to cache shopify_customer_id in DB:', dbErr)
      }
    }

    // 6) Retrieve orders for the customer
    let orders: ShopifyOrder[] = []
    if (customer) {
      try {
        const ordersRes = await fetchShopify(`/customers/${customer.id}/orders.json`)
        orders = (ordersRes.orders || []) as ShopifyOrder[]
      } catch (e) {
        console.error(`[shopify-customer] Failed to fetch orders for Shopify customer ID ${customer.id}:`, e)
      }
    }

    return NextResponse.json({
      success: true,
      customer: customer ? {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        orders_count: customer.orders_count,
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
