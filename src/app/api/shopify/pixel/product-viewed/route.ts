import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
} from '@/lib/shopify/shopify-helper'
import { applyShopifyCors, shopifyCorsPreflight } from '@/lib/shopify/cors'

export async function OPTIONS(request: Request) {
  return shopifyCorsPreflight(request)
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const supabase = supabaseAdmin()

  try {
    const payload = await request.json()
    const { customer_id, email, phone, first_name, last_name, product_id, product_title, price, product_url } = payload

    if (!customer_id && !email && !phone) {
      const res = NextResponse.json({ success: false, message: 'Unidentifiable visitor, skipped' })
      return applyShopifyCors(res, origin)
    }

    const { accountId, userId } = await getShopifyAccountContext(supabase)

    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
      id: customer_id,
      email,
      phone,
      first_name,
      last_name,
    })

    if (!contact) {
      const res = NextResponse.json({ success: false, message: 'Could not resolve contact' })
      return applyShopifyCors(res, origin)
    }

    const hasConsent = !!(contact.whatsapp_marketing_opt_in || contact.marketing_opt_in)
    if (!hasConsent) {
      const res = NextResponse.json({ success: false, message: 'Skipped: Contact does not have marketing consent' })
      return applyShopifyCors(res, origin)
    }

    const { data: activeSeq } = await supabase
      .from('shopify_recovery_tracking')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (activeSeq) {
      const res = NextResponse.json({ success: false, message: 'Skipped: Active recovery sequence already in progress' })
      return applyShopifyCors(res, origin)
    }

    const { data: sequence } = await supabase
      .from('shopify_automation_sequences')
      .select('id, is_active')
      .eq('account_id', accountId)
      .eq('trigger_type', 'browse_abandoned')
      .eq('is_active', true)
      .maybeSingle()

    if (!sequence) {
      const res = NextResponse.json({ success: false, message: 'Skipped: Browse abandonment sequence not active' })
      return applyShopifyCors(res, origin)
    }

    const { data: step } = await supabase
      .from('shopify_automation_sequence_steps')
      .select('id, delay_minutes_from_previous_step, meta_approval_status, is_active')
      .eq('sequence_id', sequence.id)
      .eq('step_order', 1)
      .eq('is_active', true)
      .eq('meta_approval_status', 'approved')
      .maybeSingle()

    if (!step) {
      const res = NextResponse.json({ success: false, message: 'Skipped: Browse abandonment step 1 not active/approved' })
      return applyShopifyCors(res, origin)
    }

    const nextSendAt = new Date(Date.now() + step.delay_minutes_from_previous_step * 60000).toISOString()

    await supabase
      .from('shopify_recovery_tracking')
      .insert({
        account_id: accountId,
        contact_id: contact.id,
        sequence_id: sequence.id,
        current_step: 1,
        status: 'in_progress',
        next_send_at: nextSendAt,
        metadata: {
          product_id,
          product_title,
          price: String(price),
          product_url,
        },
      })

    const res = NextResponse.json({ success: true })
    return applyShopifyCors(res, origin)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[wacrm-pixel] error tracking product view:', err)
    const res = NextResponse.json({ error: message }, { status: 500 })
    return applyShopifyCors(res, origin)
  }
}
