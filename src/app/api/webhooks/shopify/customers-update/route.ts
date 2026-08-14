import { NextResponse } from 'next/server'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  getShopifyAccountContext,
  matchOrCreateShopifyContact,
} from '@/lib/shopify/shopify-helper'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    console.warn('[shopify-webhook] customers/update: rejected invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  let accountId = ''

  try {
    const payload = JSON.parse(rawBody)
    const { accountId: resolvedAccountId, userId } = await getShopifyAccountContext(supabase)
    accountId = resolvedAccountId

    const acceptsMarketing =
      payload.sms_marketing_consent?.state === 'subscribed' ||
      payload.sms_marketing_consent?.state === 'opt_in' ||
      payload.accepts_marketing === true

    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
      id: payload.id,
      email: payload.email || null,
      phone: payload.phone || payload.default_address?.phone || null,
      first_name: payload.first_name || null,
      last_name: payload.last_name || null,
      marketing_opt_in: acceptsMarketing,
    })

    await supabase.from('shopify_webhook_logs').insert({
      account_id: accountId,
      topic: 'customers/update',
      payload,
      status: contact ? 'success' : 'skipped_not_activated',
      error_message: contact ? null : 'no phone or email',
    })

    return NextResponse.json({ success: true, skipped: !contact })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[shopify-webhook] error in customers/update:', err)
    if (accountId) {
      await supabase.from('shopify_webhook_logs').insert({
        account_id: accountId,
        topic: 'customers/update',
        payload: JSON.parse(rawBody || '{}'),
        status: 'failed',
        error_message: message,
      })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
