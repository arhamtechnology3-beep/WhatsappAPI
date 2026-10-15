import { z } from 'zod'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import {
  resolveStoreFromOrigin,
  visitorCorsPreflight,
  visitorJson,
} from '@/lib/visitors/store-context'
import { ingestVisitorEvents } from '@/lib/visitors/track'

const eventSchema = z.object({
  eventId: z.string().min(8).max(128).optional(),
  eventName: z.string().min(1).max(64),
  visitorId: z.string().min(8).max(128),
  sessionId: z.string().max(128).optional(),
  consentGranted: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().optional(),
})

const bodySchema = z.object({
  /** Ignored for tenancy — store comes from Origin. */
  storeId: z.string().uuid().optional(),
  events: z.array(eventSchema).min(1).max(25),
})

export async function OPTIONS(request: Request) {
  return visitorCorsPreflight(request)
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const supabase = supabaseAdmin()

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const limited = checkRateLimit(`visitor-track:${ip}`, RATE_LIMITS.storefrontTrack)
  if (!limited.success) return rateLimitResponse(limited)

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return visitorJson({ error: 'Invalid JSON' }, 400, origin)
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return visitorJson({ error: 'Invalid payload' }, 400, origin)
  }

  const store = await resolveStoreFromOrigin(supabase, origin)
  if (!store) {
    return visitorJson({ error: 'Unknown store' }, 404, origin)
  }

  const result = await ingestVisitorEvents(supabase, {
    storeId: store.id,
    organizationId: store.organization_id,
    events: parsed.data.events,
  })

  return visitorJson({ ok: true, ...result }, 200, origin)
}
