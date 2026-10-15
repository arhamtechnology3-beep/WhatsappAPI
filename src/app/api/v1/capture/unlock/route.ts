import { z } from 'zod'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import {
  resolveStoreFromOrigin,
  visitorCorsPreflight,
  visitorJson,
} from '@/lib/visitors/store-context'
import { newUnlockRefCode } from '@/lib/visitors/tokens'
import {
  getOrCreateCaptureSettings,
  buildUnlockWhatsAppUrl,
} from '@/lib/visitors/capture-settings'

const bodySchema = z.object({
  visitorId: z.string().min(8).max(128),
  sessionId: z.string().max(128).optional(),
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
  const limited = checkRateLimit(
    `visitor-unlock:${ip}`,
    RATE_LIMITS.storefrontIdentify,
  )
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

  const settings = await getOrCreateCaptureSettings(supabase, {
    storeId: store.id,
    organizationId: store.organization_id,
  })

  if (!settings.popup_enabled) {
    return visitorJson({ error: 'Popup disabled' }, 403, origin)
  }

  const now = new Date()
  // Reuse an unclaimed ref for the same visitor within the hour.
  const { data: existing } = await supabase
    .from('wa_unlock_requests')
    .select('ref_code, expires_at')
    .eq('store_id', store.id)
    .eq('visitor_id', parsed.data.visitorId)
    .is('claimed_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let refCode = existing?.ref_code
  if (!refCode) {
    refCode = newUnlockRefCode()
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('wa_unlock_requests').insert({
      ref_code: refCode,
      store_id: store.id,
      organization_id: store.organization_id,
      visitor_id: parsed.data.visitorId,
      session_id: parsed.data.sessionId || null,
      expires_at: expiresAt,
    })
    if (error) {
      console.error('[unlock] insert', error.message)
      return visitorJson({ error: 'Could not create unlock' }, 500, origin)
    }
  }

  const waUrl = buildUnlockWhatsAppUrl({
    whatsappNumber: settings.whatsapp_number,
    discountCode: settings.discount_code,
    refCode,
  })

  return visitorJson(
    {
      ok: true,
      refCode,
      waUrl,
      offerText: settings.offer_text,
      discountCode: settings.discount_code,
      consentText:
        'By messaging us you agree to receive offers on WhatsApp. Reply STOP anytime.',
    },
    200,
    origin,
  )
}
