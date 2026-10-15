import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getCurrentAccount } from '@/lib/auth/account'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'

// GET /api/shopify/visitor-sessions
// Prefer main-DB visitor_sessions (IdentityFlow). Falls back to the
// legacy VISITOR_TRACKING project when the main table is empty.
export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const main = supabaseAdmin()
    const store = await resolveStoreForAccount(main, ctx.accountId)

    type SessionRow = {
      id: string
      visitor_id: string
      session_id: string
      device_type?: string | null
      referrer_source?: string | null
      utm_params?: unknown
      session_start: string
      pages_viewed?: unknown
      products_viewed?: unknown
      cart_events?: unknown
      associated_phone?: string | null
      associated_email?: string | null
      associated_name?: string | null
      last_activity_at?: string | null
    }
    type IdentityRow = {
      visitor_id: string
      phone_number?: string | null
      contact_id?: string | null
      source?: string | null
      linked_at?: string | null
      last_seen_at?: string | null
      first_linked_at?: string | null
    }

    let sessions: SessionRow[] = []
    let identityMap: IdentityRow[] = []

    if (store) {
      const { data: mainSessions } = await main
        .from('visitor_sessions')
        .select(
          'id,visitor_id,session_id,device_type,referrer_source,utm_params,session_start,pages_viewed,products_viewed,cart_events,associated_phone,associated_email,associated_name,last_activity_at',
        )
        .eq('store_id', store.id)
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(200)

      sessions = mainSessions || []

      const { data: idRows } = await main
        .from('visitor_identity_map')
        .select('visitor_id,phone_number,contact_id,source,linked_at,last_seen_at')
        .eq('store_id', store.id)
        .order('last_seen_at', { ascending: false })
        .limit(500)
      identityMap = idRows || []
    }

    // Legacy fallback when main DB has nothing yet
    if (sessions.length === 0) {
      const trackingUrl = process.env.VISITOR_TRACKING_SUPABASE_URL
      const trackingKey = process.env.VISITOR_TRACKING_SUPABASE_ANON_KEY
      if (trackingUrl && trackingKey) {
        const sessionsRes = await fetch(
          `${trackingUrl}/rest/v1/visitor_sessions?order=session_start.desc&limit=200&select=id,visitor_id,session_id,device_type,referrer_source,utm_params,session_start,pages_viewed,products_viewed,cart_events,associated_phone,associated_email,associated_name`,
          {
            headers: {
              apikey: trackingKey,
              Authorization: `Bearer ${trackingKey}`,
              'Content-Type': 'application/json',
            },
          },
        )
        if (sessionsRes.ok) sessions = await sessionsRes.json()

        const identityRes = await fetch(
          `${trackingUrl}/rest/v1/visitor_identity_map?order=first_linked_at.desc&limit=500&select=visitor_id,phone_number,first_linked_at`,
          {
            headers: {
              apikey: trackingKey,
              Authorization: `Bearer ${trackingKey}`,
              'Content-Type': 'application/json',
            },
          },
        )
        if (identityRes.ok) identityMap = await identityRes.json()
      }
    }

    const visitorPhoneMap: Record<string, string> = {}
    const visitorContactMap: Record<string, string> = {}
    const visitorSourceMap: Record<string, string> = {}
    for (const entry of identityMap) {
      if (entry.phone_number && !visitorPhoneMap[entry.visitor_id]) {
        visitorPhoneMap[entry.visitor_id] = entry.phone_number
      }
      if (entry.contact_id && !visitorContactMap[entry.visitor_id]) {
        visitorContactMap[entry.visitor_id] = entry.contact_id
      }
      if (entry.source && !visitorSourceMap[entry.visitor_id]) {
        visitorSourceMap[entry.visitor_id] = entry.source
      }
    }

    const allPhones = new Set<string>()
    for (const s of sessions) {
      if (s.associated_phone) allPhones.add(s.associated_phone)
    }
    for (const phone of Object.values(visitorPhoneMap)) {
      if (phone) allPhones.add(phone as string)
    }

    const phoneContactMap: Record<string, { name: string; id: string }> = {}
    if (allPhones.size > 0) {
      const phonesArr = Array.from(allPhones)
      const { data: contacts } = await main
        .from('contacts')
        .select('id, name, phone')
        .eq('account_id', ctx.accountId)
        .in('phone', phonesArr)
      if (contacts) {
        for (const c of contacts) {
          if (c.phone) phoneContactMap[c.phone] = { name: c.name, id: c.id }
        }
      }
    }

    const enriched = sessions.map((s) => {
      const phone = s.associated_phone || visitorPhoneMap[s.visitor_id] || null
      const digits = phone ? phone.replace(/\D/g, '') : null
      const last10 = digits ? digits.slice(-10) : null
      const phoneVariants = last10
        ? [phone, last10, `91${last10}`, `+91${last10}`].filter(Boolean)
        : []

      let contact: { name: string; id: string } | null = null
      if (visitorContactMap[s.visitor_id]) {
        contact = { name: '', id: visitorContactMap[s.visitor_id] }
      }
      for (const v of phoneVariants) {
        if (v && phoneContactMap[v]) {
          contact = phoneContactMap[v]
          break
        }
      }

      const pagesViewed = Array.isArray(s.pages_viewed) ? s.pages_viewed : []
      const cartEvents = Array.isArray(s.cart_events) ? s.cart_events : []
      const lastPageRaw = pagesViewed.length > 0 ? pagesViewed[pagesViewed.length - 1] : null
      const lastPage =
        lastPageRaw && typeof lastPageRaw === 'object'
          ? String(
              (lastPageRaw as { path?: unknown; url?: unknown }).path ||
                (lastPageRaw as { path?: unknown; url?: unknown }).url ||
                '',
            ) || null
          : null

      return {
        id: s.id,
        visitor_id: s.visitor_id,
        session_id: s.session_id,
        device_type: s.device_type || 'Unknown',
        referrer_source: s.referrer_source || 'Direct',
        session_start: s.session_start,
        last_activity_at: s.last_activity_at || s.session_start,
        pages_viewed_count: pagesViewed.length,
        cart_events_count: cartEvents.length,
        last_page: lastPage,
        associated_phone: phone,
        associated_email: s.associated_email || null,
        associated_name: s.associated_name || null,
        contact_name: contact?.name || null,
        contact_id: contact?.id || null,
        identity_source: visitorSourceMap[s.visitor_id] || null,
        is_identified: !!(phone || s.associated_email || contact?.id),
      }
    })

    const stats = {
      total: enriched.length,
      mobile: enriched.filter((s) => s.device_type === 'Mobile').length,
      identified: enriched.filter((s) => s.is_identified).length,
      linked_to_contact: enriched.filter((s) => s.contact_id).length,
    }

    return NextResponse.json({ sessions: enriched, stats })
  } catch (err: unknown) {
    console.error('[visitor-sessions] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
