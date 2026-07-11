import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getCurrentAccount } from '@/lib/auth/account'

// GET /api/shopify/visitor-sessions
// Fetches anonymous visitor sessions from the tracking Supabase project,
// enriched with contact info from the main app database.
export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const trackingUrl  = process.env.VISITOR_TRACKING_SUPABASE_URL
    const trackingKey  = process.env.VISITOR_TRACKING_SUPABASE_ANON_KEY

    if (!trackingUrl || !trackingKey) {
      return NextResponse.json(
        { error: 'Visitor tracking Supabase not configured. Add VISITOR_TRACKING_SUPABASE_URL and VISITOR_TRACKING_SUPABASE_ANON_KEY to your env.' },
        { status: 503 }
      )
    }

    // 1. Fetch recent visitor sessions from tracking project
    const sessionsRes = await fetch(
      `${trackingUrl}/rest/v1/visitor_sessions?order=session_start.desc&limit=200&select=id,visitor_id,session_id,device_type,referrer_source,utm_params,session_start,pages_viewed,products_viewed,cart_events,associated_phone,associated_email,associated_name`,
      {
        headers: {
          apikey: trackingKey,
          Authorization: `Bearer ${trackingKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      }
    )
    if (!sessionsRes.ok) {
      const txt = await sessionsRes.text()
      return NextResponse.json(
        { error: `Tracking DB error fetching sessions: ${txt}` },
        { status: 502 }
      )
    }
    const sessions: any[] = await sessionsRes.json()

    // 2. Fetch identity map (visitor_id to phone)
    const identityRes = await fetch(
      `${trackingUrl}/rest/v1/visitor_identity_map?order=first_linked_at.desc&limit=500&select=visitor_id,phone_number,first_linked_at`,
      {
        headers: {
          apikey: trackingKey,
          Authorization: `Bearer ${trackingKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      }
    )
    const identityMap: any[] = identityRes.ok ? await identityRes.json() : []

    // Build a visitor_id to phone lookup
    const visitorPhoneMap: Record<string, string> = {}
    for (const entry of identityMap) {
      if (!visitorPhoneMap[entry.visitor_id]) {
        visitorPhoneMap[entry.visitor_id] = entry.phone_number
      }
    }

    // 3. Collect all known phones to look up in main contacts DB
    const allPhones = new Set<string>()
    for (const s of sessions) {
      if (s.associated_phone) allPhones.add(s.associated_phone)
    }
    for (const phone of Object.values(visitorPhoneMap)) {
      if (phone) allPhones.add(phone as string)
    }

    // 4. Look up contacts by phone in the main app database
    const phoneContactMap: Record<string, { name: string; id: string }> = {}
    if (allPhones.size > 0) {
      const main = supabaseAdmin()
      const phonesArr = Array.from(allPhones)
      const { data: contacts } = await main
        .from('contacts')
        .select('id, name, phone')
        .eq('account_id', ctx.accountId)
        .in('phone', phonesArr)
      if (contacts) {
        for (const c of contacts) {
          if (c.phone) {
            phoneContactMap[c.phone] = { name: c.name, id: c.id }
          }
        }
      }
    }

    // 5. Enrich each session
    const enriched = sessions.map((s: any) => {
      // Phone from session itself or from identity map
      const phone = s.associated_phone || visitorPhoneMap[s.visitor_id] || null

      // Try multiple phone formats to match DB
      const digits = phone ? phone.replace(/\D/g, '') : null
      const last10 = digits ? digits.slice(-10) : null
      const phoneVariants = last10
        ? [phone, last10, `91${last10}`, `+91${last10}`].filter(Boolean)
        : []

      let contact: { name: string; id: string } | null = null
      for (const v of phoneVariants) {
        if (v && phoneContactMap[v]) {
          contact = phoneContactMap[v]
          break
        }
      }

      const pagesViewed: any[] = Array.isArray(s.pages_viewed) ? s.pages_viewed : []
      const cartEvents: any[] = Array.isArray(s.cart_events) ? s.cart_events : []

      return {
        id: s.id,
        visitor_id: s.visitor_id,
        session_id: s.session_id,
        device_type: s.device_type || 'Unknown',
        referrer_source: s.referrer_source || 'Direct',
        session_start: s.session_start,
        pages_viewed_count: pagesViewed.length,
        cart_events_count: cartEvents.length,
        last_page: pagesViewed.length > 0 ? pagesViewed[pagesViewed.length - 1]?.url || null : null,
        associated_phone: phone,
        associated_email: s.associated_email || null,
        associated_name: s.associated_name || null,
        contact_name: contact?.name || null,
        contact_id: contact?.id || null,
        is_identified: !!(phone || s.associated_email),
      }
    })

    // 6. Summary stats
    const stats = {
      total: enriched.length,
      mobile: enriched.filter((s: any) => s.device_type === 'Mobile').length,
      identified: enriched.filter((s: any) => s.is_identified).length,
      linked_to_contact: enriched.filter((s: any) => s.contact_id).length,
    }

    return NextResponse.json({ sessions: enriched, stats })
  } catch (err: any) {
    console.error('[visitor-sessions] error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
