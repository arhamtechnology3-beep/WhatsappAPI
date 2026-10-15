import type { SupabaseClient } from '@supabase/supabase-js'

export type IdentitySource =
  | 'order'
  | 'customer_login'
  | 'wa_link'
  | 'wa_click'
  | 'popup'
  | 'checkout'
  | 'capture'

export type LinkVisitorOpts = {
  storeId: string
  organizationId: string
  visitorId: string
  phone: string
  contactId?: string | null
  source: IdentitySource
  now?: Date
}

/**
 * Upsert visitor_identity_map and stamp visitor_sessions.associated_*.
 * Idempotent on (visitor_id, phone_number); refreshes last_seen_at.
 */
export async function linkVisitorToContact(
  supabase: SupabaseClient,
  opts: LinkVisitorOpts,
): Promise<{ linked: boolean; mapId?: string }> {
  const phone = opts.phone.trim()
  const visitorId = opts.visitorId.trim()
  if (!phone || !visitorId) return { linked: false }

  const now = (opts.now ?? new Date()).toISOString()

  const { data: existing } = await supabase
    .from('visitor_identity_map')
    .select('id, contact_id, source')
    .eq('visitor_id', visitorId)
    .eq('phone_number', phone)
    .maybeSingle()

  if (existing?.id) {
    await supabase
      .from('visitor_identity_map')
      .update({
        store_id: opts.storeId,
        organization_id: opts.organizationId,
        contact_id: opts.contactId ?? existing.contact_id,
        source: existing.source || opts.source,
        last_seen_at: now,
      })
      .eq('id', existing.id)
  } else {
    const { data: inserted, error } = await supabase
      .from('visitor_identity_map')
      .insert({
        visitor_id: visitorId,
        phone_number: phone,
        store_id: opts.storeId,
        organization_id: opts.organizationId,
        contact_id: opts.contactId ?? null,
        source: opts.source,
        linked_at: now,
        last_seen_at: now,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      // Unique race — update instead
      const { data: raced } = await supabase
        .from('visitor_identity_map')
        .select('id')
        .eq('visitor_id', visitorId)
        .eq('phone_number', phone)
        .maybeSingle()
      if (!raced) {
        console.error('[visitors] linkVisitorToContact', error.message)
        return { linked: false }
      }
    } else if (inserted?.id) {
      await stampVisitorSession(supabase, {
        storeId: opts.storeId,
        organizationId: opts.organizationId,
        visitorId,
        phone,
        now,
      })
      return { linked: true, mapId: inserted.id }
    }
  }

  await stampVisitorSession(supabase, {
    storeId: opts.storeId,
    organizationId: opts.organizationId,
    visitorId,
    phone,
    now,
  })

  return { linked: true, mapId: existing?.id }
}

async function stampVisitorSession(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    organizationId: string
    visitorId: string
    phone: string
    now: string
  },
) {
  await supabase
    .from('visitor_sessions')
    .update({
      associated_phone: opts.phone,
      store_id: opts.storeId,
      organization_id: opts.organizationId,
      last_activity_at: opts.now,
      updated_at: opts.now,
    })
    .eq('visitor_id', opts.visitorId)
}

export async function findContactIdForVisitor(
  supabase: SupabaseClient,
  opts: { storeId: string; visitorId: string },
): Promise<{ contactId: string; phone: string } | null> {
  const { data } = await supabase
    .from('visitor_identity_map')
    .select('contact_id, phone_number')
    .eq('store_id', opts.storeId)
    .eq('visitor_id', opts.visitorId)
    .not('contact_id', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.contact_id && data.phone_number) {
    return { contactId: data.contact_id, phone: data.phone_number }
  }

  // Legacy rows without store_id
  const { data: legacy } = await supabase
    .from('visitor_identity_map')
    .select('contact_id, phone_number')
    .eq('visitor_id', opts.visitorId)
    .not('contact_id', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (legacy?.contact_id && legacy.phone_number) {
    return { contactId: legacy.contact_id, phone: legacy.phone_number }
  }

  const { data: byPhone } = await supabase
    .from('visitor_identity_map')
    .select('phone_number, contact_id')
    .eq('visitor_id', opts.visitorId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!byPhone?.phone_number) return null
  if (byPhone.contact_id) {
    return { contactId: byPhone.contact_id, phone: byPhone.phone_number }
  }
  return null
}

export function extractDpVisitorIdFromOrder(payload: {
  note_attributes?: Array<{ name?: string; value?: string }> | null
  attributes?: Record<string, string> | null
  cart_attributes?: Record<string, string> | null
}): string | null {
  const notes = payload.note_attributes ?? []
  for (const n of notes) {
    const name = (n.name || '').toLowerCase()
    if (name === 'dp_visitor_id' || name === 'visitor_id') {
      const v = (n.value || '').trim()
      if (v) return v
    }
  }
  for (const bag of [payload.attributes, payload.cart_attributes]) {
    if (!bag) continue
    const v = (bag.dp_visitor_id || bag.visitor_id || '').trim()
    if (v) return v
  }
  return null
}
