import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

export const VISITOR_TRACK_EVENTS = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'remove_from_cart',
  'checkout_started',
  'session_started',
  'consent_updated',
  'popup_viewed',
  'popup_dismissed',
  'unlock_clicked',
])

const PII_KEYS = /phone|email|name|address|password|otp|token|ssn|card|cvv/i

export function isVisitorTrackEvent(name: string): boolean {
  return VISITOR_TRACK_EVENTS.has(name)
}

/** Strip query strings and PII-looking keys from event payloads. */
export function sanitizeVisitorPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (PII_KEYS.test(k)) continue
    if (typeof v === 'string') {
      let s = v.length > 500 ? v.slice(0, 500) : v
      if (/^https?:\/\//i.test(s)) {
        try {
          const u = new URL(s)
          s = `${u.origin}${u.pathname}`
        } catch {
          /* keep truncated */
        }
      }
      out[k] = s
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else if (v == null) {
      continue
    } else if (typeof v === 'object') {
      // Keep shallow product/cart objects but strip nested PII
      const nested = sanitizeVisitorPayload(v as Record<string, unknown>)
      if (Object.keys(nested).length) out[k] = nested
    }
  }
  return out
}

export type TrackEventInput = {
  eventId?: string
  eventName: string
  visitorId: string
  sessionId?: string
  consentGranted?: boolean
  payload?: Record<string, unknown>
  occurredAt?: string
}

export async function ingestVisitorEvents(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    organizationId: string
    events: TrackEventInput[]
  },
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const ev of opts.events) {
    if (!isVisitorTrackEvent(ev.eventName)) {
      skipped++
      continue
    }
    if (!ev.consentGranted && ev.eventName !== 'consent_updated') {
      skipped++
      continue
    }

    const eventId = (ev.eventId || randomUUID()).slice(0, 128)
    const payload = sanitizeVisitorPayload(ev.payload)
    const occurredAt = ev.occurredAt || now

    const { error } = await supabase.from('tracking_events').upsert(
      {
        store_id: opts.storeId,
        organization_id: opts.organizationId,
        event_id: eventId,
        event_name: ev.eventName,
        visitor_id: ev.visitorId,
        session_id: ev.sessionId || null,
        consent_granted: !!ev.consentGranted,
        payload,
        occurred_at: occurredAt,
      },
      { onConflict: 'store_id,event_id', ignoreDuplicates: true },
    )

    if (error) {
      console.error('[visitors] ingest event', error.message)
      skipped++
      continue
    }
    inserted++
  }

  // Touch / upsert a session summary row for dashboard + recovery cron.
  const last = opts.events[opts.events.length - 1]
  if (last?.visitorId && last.sessionId) {
    await upsertVisitorSessionSummary(supabase, {
      storeId: opts.storeId,
      organizationId: opts.organizationId,
      visitorId: last.visitorId,
      sessionId: last.sessionId,
      events: opts.events,
      now,
    })
  }

  return { inserted, skipped }
}

async function upsertVisitorSessionSummary(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    organizationId: string
    visitorId: string
    sessionId: string
    events: TrackEventInput[]
    now: string
  },
) {
  const pages: unknown[] = []
  const products: unknown[] = []
  const cart: unknown[] = []

  for (const ev of opts.events) {
    const p = sanitizeVisitorPayload(ev.payload)
    if (ev.eventName === 'page_view') {
      pages.push({ path: p.path || p.url, ts: ev.occurredAt || opts.now })
    } else if (ev.eventName === 'product_view') {
      products.push({
        product_id: p.product_id,
        handle: p.handle,
        title: p.title,
        price: p.price,
        variant_id: p.variant_id,
        ts: ev.occurredAt || opts.now,
      })
    } else if (
      ev.eventName === 'add_to_cart' ||
      ev.eventName === 'remove_from_cart' ||
      ev.eventName === 'checkout_started'
    ) {
      cart.push({
        type: ev.eventName,
        product_id: p.product_id,
        variant_id: p.variant_id,
        quantity: p.quantity,
        title: p.title,
        price: p.price,
        ts: ev.occurredAt || opts.now,
      })
    }
  }

  const { data: existing } = await supabase
    .from('visitor_sessions')
    .select('id, pages_viewed, products_viewed, cart_events')
    .eq('session_id', opts.sessionId)
    .maybeSingle()

  if (existing?.id) {
    const merge = (prev: unknown, next: unknown[]) => {
      const arr = Array.isArray(prev) ? [...prev] : []
      return [...arr, ...next].slice(-200)
    }
    await supabase
      .from('visitor_sessions')
      .update({
        store_id: opts.storeId,
        organization_id: opts.organizationId,
        pages_viewed: merge(existing.pages_viewed, pages),
        products_viewed: merge(existing.products_viewed, products),
        cart_events: merge(existing.cart_events, cart),
        last_activity_at: opts.now,
        updated_at: opts.now,
      })
      .eq('id', existing.id)
    return
  }

  await supabase.from('visitor_sessions').insert({
    visitor_id: opts.visitorId,
    session_id: opts.sessionId,
    store_id: opts.storeId,
    organization_id: opts.organizationId,
    pages_viewed: pages,
    products_viewed: products,
    cart_events: cart,
    session_start: opts.now,
    last_activity_at: opts.now,
  })
}
