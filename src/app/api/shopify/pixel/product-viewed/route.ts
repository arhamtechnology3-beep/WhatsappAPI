import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const supabase = supabaseAdmin()

  try {
    const payload = await request.json()
    const { customer_id, email, phone, first_name, last_name, product_id, product_title, price, product_url } = payload

    if (!customer_id && !email && !phone) {
      return NextResponse.json({ success: false, message: 'Unidentifiable visitor, skipped' })
    }

    const { accountId, userId } = await getShopifyAccountContext(supabase)

    // Resolve contact
    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
      id: customer_id,
      email,
      phone,
      first_name,
      last_name,
    })

    // Verify marketing consent
    if (!contact.whatsapp_marketing_opt_in) {
      return NextResponse.json({ success: false, message: 'Skipped: Contact does not have marketing consent' })
    }

    // Verify there is no active sequence running for this contact
    const { data: activeSeq } = await supabase
      .from('shopify_recovery_tracking')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (activeSeq) {
      return NextResponse.json({ success: false, message: 'Skipped: Active recovery sequence already in progress' })
    }

    // Load active browse_abandoned sequence rules
    const { data: sequence } = await supabase
      .from('shopify_automation_sequences')
      .select('id, is_active')
      .eq('account_id', accountId)
      .eq('trigger_type', 'browse_abandoned')
      .eq('is_active', true)
      .maybeSingle()

    if (!sequence) {
      return NextResponse.json({ success: false, message: 'Skipped: Browse abandonment sequence not active' })
    }

    // Load step 1 details
    const { data: step } = await supabase
      .from('shopify_automation_sequence_steps')
      .select('id, delay_minutes_from_previous_step, meta_approval_status, is_active')
      .eq('sequence_id', sequence.id)
      .eq('step_order', 1)
      .eq('is_active', true)
      .eq('meta_approval_status', 'approved')
      .maybeSingle()

    if (!step) {
      return NextResponse.json({ success: false, message: 'Skipped: Browse abandonment step 1 not active/approved' })
    }

    const nextSendAt = new Date(Date.now() + step.delay_minutes_from_previous_step * 60000).toISOString()

    // Create sequence tracking row
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

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[wacrm-pixel] error tracking product view:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
