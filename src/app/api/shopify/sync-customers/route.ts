import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchShopify } from '@/lib/shopify/shopify-client'

export async function POST() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let syncedCount = 0
    const processedPhones = new Set<string>()
    const processedEmails = new Set<string>()

    // 1. Fetch Customers from Shopify (up to 250)
    let shopifyCustomers: any[] = []
    try {
      const res = await fetchShopify('/customers.json?limit=250')
      shopifyCustomers = res.customers || []
    } catch (err: unknown) {
      console.warn('[shopify-sync] Failed to fetch /customers.json:', err)
    }

    // 2. Fetch Orders from Shopify (captures guest checkout customers & recent buyers)
    let shopifyOrders: any[] = []
    try {
      const res = await fetchShopify('/orders.json?status=any&limit=250')
      shopifyOrders = res.orders || []
    } catch (err: unknown) {
      console.warn('[shopify-sync] Failed to fetch /orders.json:', err)
    }

    // 3. Fetch Abandoned Checkouts from Shopify
    let shopifyCheckouts: any[] = []
    try {
      const res = await fetchShopify('/checkouts.json?limit=250')
      shopifyCheckouts = res.checkouts || []
    } catch (err: unknown) {
      console.warn('[shopify-sync] Failed to fetch /checkouts.json:', err)
    }

    // Helper to process and upsert a contact into DB
    const processContact = async (data: {
      shopifyCustomerId?: string
      name: string
      email?: string | null
      phone?: string | null
      company?: string | null
      createdAt?: string | null
    }) => {
      let phone = data.phone ? data.phone.trim() : null
      let email = data.email ? data.email.trim() : null

      if (!phone && !email) return

      // Deduplicate within this single sync batch
      const dedupeKey = phone || email!
      if (processedPhones.has(dedupeKey) || (email && processedEmails.has(email))) {
        return
      }

      let existingId: string | null = null

      // Search DB by shopify_customer_id first
      if (data.shopifyCustomerId) {
        const { data: byId } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('shopify_customer_id', String(data.shopifyCustomerId))
          .maybeSingle()

        if (byId) existingId = byId.id
      }

      // Search by phone if not found
      if (!existingId && phone) {
        const { data: byPhone } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('phone', phone)
          .maybeSingle()

        if (byPhone) existingId = byPhone.id
      }

      // Search by email if not found
      if (!existingId && email) {
        const { data: byEmail } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('email', email)
          .maybeSingle()

        if (byEmail) existingId = byEmail.id
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      }
      if (data.name) updatePayload.name = data.name
      if (email) updatePayload.email = email
      if (phone) updatePayload.phone = phone
      if (data.company) updatePayload.company = data.company
      if (data.shopifyCustomerId) updatePayload.shopify_customer_id = String(data.shopifyCustomerId)

      if (existingId) {
        await ctx.supabase
          .from('contacts')
          .update(updatePayload)
          .eq('id', existingId)
      } else {
        await ctx.supabase
          .from('contacts')
          .insert({
            account_id: ctx.accountId,
            user_id: ctx.userId,
            name: data.name,
            email: email || undefined,
            phone: phone || undefined,
            company: data.company || undefined,
            shopify_customer_id: data.shopifyCustomerId ? String(data.shopifyCustomerId) : undefined,
            created_at: data.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
      }

      if (phone) processedPhones.add(phone)
      if (email) processedEmails.add(email)
      syncedCount++
    }

    // Process Customers list first
    for (const sc of shopifyCustomers) {
      const phone = sc.phone || (sc.default_address && sc.default_address.phone) || null
      const email = sc.email || null
      const firstName = (sc.first_name || '').trim()
      const lastName = (sc.last_name || '').trim()
      let name = [firstName, lastName].filter(Boolean).join(' ')
      if (!name && email) {
        name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim()
      }
      if (!name) name = `Customer #${sc.id}`
      const company = sc.default_address ? sc.default_address.company || null : null

      await processContact({
        shopifyCustomerId: sc.id,
        name,
        email,
        phone,
        company,
        createdAt: sc.created_at
      })
    }

    // Process Orders list (captures guest checkout buyers)
    for (const o of shopifyOrders) {
      const c = o.customer || {}
      const addr = o.shipping_address || o.billing_address || {}
      const phone = o.phone || addr.phone || c.phone || null
      const email = o.email || c.email || null
      const firstName = (c.first_name || addr.first_name || '').trim()
      const lastName = (c.last_name || addr.last_name || '').trim()
      let name = [firstName, lastName].filter(Boolean).join(' ')
      if (!name && email) {
        name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim()
      }
      if (!name) name = `Customer #${c.id || o.id}`
      const company = addr.company || c.default_address?.company || null

      await processContact({
        shopifyCustomerId: c.id,
        name,
        email,
        phone,
        company,
        createdAt: o.created_at
      })
    }

    // Process Checkouts list (captures abandoned cart leads)
    for (const co of shopifyCheckouts) {
      const addr = co.shipping_address || co.billing_address || {}
      const phone = co.phone || addr.phone || null
      const email = co.email || null
      const firstName = (addr.first_name || '').trim()
      const lastName = (addr.last_name || '').trim()
      let name = [firstName, lastName].filter(Boolean).join(' ')
      if (!name && email) {
        name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim()
      }
      if (!name) name = `Checkout User #${co.id || co.token}`
      const company = addr.company || null

      await processContact({
        shopifyCustomerId: co.customer_id,
        name,
        email,
        phone,
        company,
        createdAt: co.created_at
      })
    }

    return NextResponse.json({
      success: true,
      syncedCount
    })
  } catch (err: unknown) {
    console.error('[shopify-sync] sync-customers error:', err)
    return toErrorResponse(err)
  }
}
