import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'
import { getOrCreateCaptureSettings } from '@/lib/visitors/capture-settings'

const patchSchema = z.object({
  popup_enabled: z.boolean().optional(),
  popup_delay_seconds: z.number().int().min(0).max(600).optional(),
  offer_text: z.string().min(1).max(200).optional(),
  discount_code: z.string().min(1).max(40).optional(),
  whatsapp_number: z.string().max(20).nullable().optional(),
  policy_version: z.string().min(1).max(40).optional(),
  browse_nudge_enabled: z.boolean().optional(),
  cart_nudge_enabled: z.boolean().optional(),
  visit_nudge_enabled: z.boolean().optional(),
  max_marketing_per_24h: z.number().int().min(0).max(10).optional(),
  browse_visit_cooldown_days: z.number().int().min(0).max(90).optional(),
  skip_recent_buyer_days: z.number().int().min(0).max(90).optional(),
  inactivity_min_minutes: z.number().int().min(5).max(1440).optional(),
  inactivity_max_minutes: z.number().int().min(10).max(2880).optional(),
})

export async function GET() {
  try {
    const ctx = await requireRole('viewer')
    const supabase = supabaseAdmin()
    const store = await resolveStoreForAccount(supabase, ctx.accountId)
    if (!store) {
      return NextResponse.json({ error: 'No store' }, { status: 404 })
    }
    const settings = await getOrCreateCaptureSettings(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
    })
    return NextResponse.json({ settings, storeId: store.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const supabase = supabaseAdmin()
    const store = await resolveStoreForAccount(supabase, ctx.accountId)
    if (!store) {
      return NextResponse.json({ error: 'No store' }, { status: 404 })
    }

    const json = await request.json()
    const parsed = patchSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
    }

    await getOrCreateCaptureSettings(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
    })

    const patch = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('visitor_capture_settings')
      .update(patch)
      .eq('store_id', store.id)
      .select('*')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ settings: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
