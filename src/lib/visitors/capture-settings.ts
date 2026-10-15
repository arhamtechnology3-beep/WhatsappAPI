import type { SupabaseClient } from '@supabase/supabase-js'

export type VisitorCaptureSettings = {
  store_id: string
  organization_id: string
  popup_enabled: boolean
  popup_delay_seconds: number
  offer_text: string
  discount_code: string
  whatsapp_number: string | null
  policy_version: string
  browse_nudge_enabled: boolean
  cart_nudge_enabled: boolean
  visit_nudge_enabled: boolean
  max_marketing_per_24h: number
  browse_visit_cooldown_days: number
  skip_recent_buyer_days: number
  inactivity_min_minutes: number
  inactivity_max_minutes: number
}

const DEFAULTS = {
  popup_enabled: false,
  popup_delay_seconds: 25,
  offer_text: 'Unlock 10% OFF on WhatsApp',
  discount_code: 'DP10',
  whatsapp_number: null as string | null,
  policy_version: 'v1',
  browse_nudge_enabled: true,
  cart_nudge_enabled: true,
  visit_nudge_enabled: true,
  max_marketing_per_24h: 1,
  browse_visit_cooldown_days: 7,
  skip_recent_buyer_days: 3,
  inactivity_min_minutes: 60,
  inactivity_max_minutes: 120,
}

export async function getOrCreateCaptureSettings(
  supabase: SupabaseClient,
  opts: { storeId: string; organizationId: string },
): Promise<VisitorCaptureSettings> {
  const { data } = await supabase
    .from('visitor_capture_settings')
    .select('*')
    .eq('store_id', opts.storeId)
    .maybeSingle()

  if (data) return data as VisitorCaptureSettings

  const row = {
    store_id: opts.storeId,
    organization_id: opts.organizationId,
    ...DEFAULTS,
    whatsapp_number:
      process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?.replace(/\D/g, '') ||
      null,
  }

  const { data: inserted, error } = await supabase
    .from('visitor_capture_settings')
    .upsert(row, { onConflict: 'store_id' })
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[visitors] capture settings', error.message)
  }

  return (inserted as VisitorCaptureSettings) || (row as VisitorCaptureSettings)
}

export function buildUnlockWhatsAppUrl(opts: {
  whatsappNumber: string | null
  discountCode: string
  refCode: string
}): string {
  const digits = (opts.whatsappNumber || '').replace(/\D/g, '')
  const text = `Hi! Send my ${opts.discountCode} code (ref ${opts.refCode})`
  if (!digits) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function parseUnlockRefFromMessage(text: string): string | null {
  const m = text.match(/\bref\s*([A-Z0-9]{4,8})\b/i)
  return m?.[1]?.toUpperCase() ?? null
}
