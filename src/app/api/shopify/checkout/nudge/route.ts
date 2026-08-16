import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { moveDealToStageName } from '@/lib/shopify/shopify-helper'
import { canonicalRecipeName, recipeByName } from '@/lib/shopify/whatsapp-template-library'
import { findOrCreateConversation } from '@/lib/inbox/find-or-create-conversation'

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

    const targetTemplateName = canonicalRecipeName(
      step?.template_name || 'wacrm_cart_abandoned_v4',
    )

    // 3. Find or create conversation for the contact
    const conv = await findOrCreateConversation(supabase, {
      accountId,
      userId: user.id,
      contactId: checkout.contact_id,
    })
    if (!conv) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    // 4. Map the parameters for the template
    const contact = checkout.contacts
    const customerFirstName = contact?.name?.split(' ')[0] || 'Customer'
    const lineItems = checkout.line_items || []
    const productName = lineItems[0]?.title || 'your cart items'

    const totalPrice = Number(checkout.total_price || 0)
    let dynamicOffer = '🎁 Get 10% OFF on orders above ₹749 + Free Shipping on ₹599+!'
    if (totalPrice >= 749) {
      dynamicOffer = '🎉 10% Discount & FREE Shipping auto-applied at checkout!'
    } else if (totalPrice >= 599) {
      dynamicOffer = '🚚 FREE Shipping auto-applied at checkout! (Add items worth ₹' + (749 - totalPrice) + ' for 10% OFF)'
    } else if (totalPrice > 0) {
      dynamicOffer = '✨ Add items worth ₹' + (599 - totalPrice) + ' to get FREE Shipping & ₹' + (749 - totalPrice) + ' for 10% OFF!'
    }

    const recipe = recipeByName(targetTemplateName)
    let params: string[] = [customerFirstName, productName]
    if ((recipe?.variables.length ?? 2) >= 3) {
      params = [customerFirstName, productName, dynamicOffer]
    }

    // 5. Send the template message immediately
    try {
      await engineSendTemplate({
        accountId,
        userId: user.id,
        conversationId: conv.id,
        contactId: checkout.contact_id,
        templateName: targetTemplateName,
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
