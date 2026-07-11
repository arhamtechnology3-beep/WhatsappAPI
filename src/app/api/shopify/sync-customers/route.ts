import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchShopify } from '@/lib/shopify/shopify-client'

export async function POST() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Fetch customers from Shopify
    let shopifyCustomers = []
    try {
      const res = await fetchShopify('/customers.json?limit=100')
      shopifyCustomers = res.customers || []
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ success: false, error: 'Failed to fetch from Shopify: ' + errMsg }, { status: 500 })
    }

    let syncedCount = 0

    // 2. Loop through customers and upsert into contacts
    for (const sc of shopifyCustomers) {
      let phone = sc.phone || (sc.default_address && sc.default_address.phone) || null
      if (phone) {
        phone = phone.trim()
      }

      const email = sc.email ? sc.email.trim() : null

      // Build a real name from Shopify data
      const firstName = (sc.first_name || '').trim()
      const lastName  = (sc.last_name  || '').trim()
      let name = [firstName, lastName].filter(Boolean).join(' ')

      // Fallback: use email prefix as name (e.g. "john.doe@..." → "John Doe")
      if (!name && email) {
        const prefix = email.split('@')[0]
        name = prefix
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
          .trim()
      }

      // Final fallback: use Shopify customer ID as identifier
      if (!name) {
        name = `Customer #${sc.id}`
      }

      const company = sc.default_address ? sc.default_address.company || null : null

      // Skip truly empty records (no phone, no email, no usable name from Shopify)
      if (!phone && !email) {
        continue
      }

      // Check if contact already exists in database
      let existingId: string | null = null

      // Search by shopify_customer_id first
      const { data: byId } = await ctx.supabase
        .from('contacts')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('shopify_customer_id', String(sc.id))
        .maybeSingle()

      if (byId) {
        existingId = byId.id
      } else if (phone) {
        // Fallback: search by phone
        const { data: byPhone } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('phone', phone)
          .maybeSingle()
        if (byPhone) {
          existingId = byPhone.id
        }
      }

      if (!existingId && email) {
        // Fallback: search by email
        const { data: byEmail } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('email', email)
          .maybeSingle()
        if (byEmail) {
          existingId = byEmail.id
        }
      }

      if (existingId) {
        // Update contact — always overwrite with the real Shopify name
        await ctx.supabase
          .from('contacts')
          .update({
            name,
            email: email || undefined,
            phone: phone || undefined,
            company: company || undefined,
            shopify_customer_id: String(sc.id),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingId)
      } else {
        // Insert new contact record
        await ctx.supabase
          .from('contacts')
          .insert({
            account_id: ctx.accountId,
            user_id: ctx.userId,
            name,
            email: email || undefined,
            phone: phone || undefined,
            company: company || undefined,
            shopify_customer_id: String(sc.id),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
      }
      syncedCount++
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
