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

      // Skip customers without a phone number/mobile number
      if (!phone) {
        continue
      }

      const email = sc.email ? sc.email.trim() : null
      const name = `${sc.first_name || ''} ${sc.last_name || ''}`.trim() || 'Shopify Customer'
      const company = sc.default_address ? sc.default_address.company || null : null

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
      } else {
        // Fallback: search by phone
        const { data: byPhone } = await ctx.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('phone', phone)
          .maybeSingle()

        if (byPhone) {
          existingId = byPhone.id
        } else if (email) {
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
      }

      if (existingId) {
        // Update contact record
        await ctx.supabase
          .from('contacts')
          .update({
            name,
            email: email || undefined,
            phone,
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
            phone,
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
