import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getShopifyAccountContext } from '@/lib/shopify/shopify-helper'
import { findExistingContact } from '@/lib/contacts/dedupe'

// CORS helpers — allow calls from the Shopify storefront
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
  const response = NextResponse.json({}, { status: 204 })
  setCorsHeaders(response, origin)
  return response
}

// POST /api/shopify/capture-visitor
// Called from smart-cart.js whenever a visitor identifies themselves with their
// phone number (ID modal, address form, or Shopify customer login).
// Creates or updates a Contact in the main CRM. Never overwrites an existing
// contact's name with blank values.
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  try {
    const body = await request.json()
    const phone: string | null = body.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : null
    const email: string | null = body.email ? String(body.email).trim().toLowerCase() : null
    const rawName: string | null = body.name ? String(body.name).trim() : null

    // Need at least a phone or email to be useful
    if (!phone && !email) {
      const res = NextResponse.json({ success: false, error: 'phone or email required' }, { status: 400 })
      setCorsHeaders(res, origin)
      return res
    }

    const supabase = supabaseAdmin()
    const { accountId, userId } = await getShopifyAccountContext(supabase)

    // Normalize phone for DB lookup — try both with and without country code
    const phoneVariants: string[] = []
    if (phone) {
      phoneVariants.push(phone, `91${phone}`, `+91${phone}`)
    }

    // 1. Find existing contact by phone first, then email
    let contact: any = null
    for (const variant of phoneVariants) {
      contact = await findExistingContact(supabase, accountId, variant)
      if (contact) break
    }

    if (!contact && email) {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('email', email)
        .maybeSingle()
      contact = data
    }

    // Build the canonical phone to store (prefer 91-prefixed)
    const storedPhone = phone ? `91${phone}` : null

    if (contact) {
      // 2. Update existing contact — only fill in blanks; never blank out existing values
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (rawName && (!contact.name || contact.name === 'Shopify Customer')) updates.name = rawName
      if (storedPhone && !contact.phone) updates.phone = storedPhone
      if (email && !contact.email) updates.email = email

      // Add "Visitor" tag if not already tagged
      const existingTags: string[] = Array.isArray(contact.tags) ? contact.tags : []
      if (!existingTags.includes('Visitor')) {
        updates.tags = [...existingTags, 'Visitor']
      }

      await supabase.from('contacts').update(updates).eq('id', contact.id)

      const res = NextResponse.json({ success: true, action: 'updated', contact_id: contact.id })
      setCorsHeaders(res, origin)
      return res
    } else {
      // 3. Create new contact
      // Generate a name: use provided name, or derive from phone/email
      let name = rawName
      if (!name && email) {
        const prefix = email.split('@')[0]
        name = prefix
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
          .trim()
      }
      if (!name && phone) {
        name = `Visitor ${phone.slice(-4)}`
      }

      const { data: newContact, error: insertErr } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: userId,
          name: name || 'Website Visitor',
          phone: storedPhone || undefined,
          email: email || undefined,
          tags: ['Visitor'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('[capture-visitor] insert error:', insertErr)
        const res = NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
        setCorsHeaders(res, origin)
        return res
      }

      const res = NextResponse.json({ success: true, action: 'created', contact_id: newContact?.id })
      setCorsHeaders(res, origin)
      return res
    }
  } catch (err: any) {
    console.error('[capture-visitor] error:', err)
    const res = NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 })
    setCorsHeaders(res, origin)
    return res
  }
}
