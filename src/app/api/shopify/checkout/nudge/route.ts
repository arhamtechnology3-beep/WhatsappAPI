import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { moveDealToStageName } from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const { checkout_id } = await request.json()
    if (!checkout_id) {
      return NextResponse.json({ error: 'checkout_id is required' }, { status: 400 })
    }

    // 1. Fetch the checkout joined with contacts
    const { data: checkout, error: checkoutErr } = await supabase
      .from('shopify_checkouts')
      .select('*, contacts(*)')
      .eq('shopify_checkout_id', checkout_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (checkoutErr || !checkout) {
      return NextResponse.json({ error: 'Checkout not found.' }, { status: 404 })
    }

    // 2. Fetch the active cart_abandoned sequence
    const { data: sequence } = await supabase
      .from('shopify_automation_sequences')
      .select('id')
      .eq('account_id', accountId)
      .eq('trigger_type', 'cart_abandoned')
      .maybeSingle()

    if (!sequence) {
      return NextResponse.json({ error: 'Abandoned cart automation sequence not found. Please configure it under Settings > Shopify Store.' }, { status: 400 })
    }

    const { data: step } = await supabase
      .from('shopify_automation_sequence_steps')
      .select('template_name, is_active')
      .eq('sequence_id', sequence.id)
      .eq('step_order', 1)
      .maybeSingle()

    if (!step || !step.template_name) {
      return NextResponse.json({ error: 'Step 1 template for abandoned cart recovery not configured.' }, { status: 400 })
    }

    // Check if the template is approved or not
    const { data: templateRow } = await supabase
      .from('message_templates')
      .select('status')
      .eq('account_id', accountId)
      .eq('name', step.template_name)
      .eq('language', 'en_US')
      .maybeSingle()

    if (!templateRow || templateRow.status !== 'APPROVED') {
      return NextResponse.json({ error: `Template "${step.template_name}" must be APPROVED by Meta before sending. Current status: ${templateRow?.status || 'NOT_SUBMITTED'}` }, { status: 400 })
    }

    // 3. Find or create conversation for the contact
    let { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', checkout.contact_id)
      .maybeSingle()

    if (!conv) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          account_id: accountId,
          user_id: user.id,
          contact_id: checkout.contact_id,
        })
        .select('id')
        .single()

      if (convError || !newConv) {
        return NextResponse.json({ error: 'Failed to create conversation: ' + (convError?.message || '') }, { status: 500 })
      }
      conv = newConv
    }

    // 4. Map the parameters for the template
    const contact = checkout.contacts
    const customerFirstName = contact?.name?.split(' ')[0] || 'Customer'
    const lineItems = checkout.line_items || []
    const productName = lineItems[0]?.title || 'your cart items'
    const checkoutUrl = checkout.abandoned_checkout_url || ''
    const storeName = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'Our Store'

    // Variables for wacrm_cart_abandoned_v1 are customer_name, product_name, store_name, checkout_url
    const params = [customerFirstName, productName, storeName, checkoutUrl]

    // 5. Send the template message immediately
    try {
      await engineSendTemplate({
        accountId,
        userId: user.id,
        conversationId: conv.id,
        contactId: checkout.contact_id,
        templateName: step.template_name,
        params,
      })
    } catch (sendErr: any) {
      return NextResponse.json({ error: `Meta send failed: ${sendErr.message || sendErr}` }, { status: 502 })
    }

    // 6. Update checkout status & pipeline deal stage
    await supabase
      .from('shopify_checkouts')
      .update({ status: 'abandoned_notified', updated_at: new Date().toISOString() })
      .eq('id', checkout.id)

    if (checkout.deal_id) {
      await moveDealToStageName(supabase, checkout.deal_id, 'Nudged / In Recovery', accountId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
