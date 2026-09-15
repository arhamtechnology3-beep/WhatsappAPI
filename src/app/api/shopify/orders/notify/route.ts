import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { enqueueShopifyNotification } from '@/lib/shopify/shopify-helper'
import { isShopifyCodOrder, recoverMissingShopifyPhone } from '@/lib/shopify/order-notify'
import { processWhatsAppSendJobs } from '@/lib/whatsapp/process-send-jobs'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
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

    const body = await request.json().catch(() => ({}))
    const shopifyOrderId = String(body.shopify_order_id || '').trim()
    if (!shopifyOrderId) {
      return NextResponse.json({ error: 'shopify_order_id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: order, error: orderErr } = await admin
      .from('shopify_orders')
      .select('id, shopify_order_id, order_number, total_price, financial_status, contact_id, contacts(name, phone)')
      .eq('account_id', accountId)
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (!order.contact_id) {
      return NextResponse.json({ error: 'Order has no linked contact' }, { status: 422 })
    }

    const contact = Array.isArray(order.contacts) ? order.contacts[0] : order.contacts
    let phone = toMetaPhone(contact?.phone)
    if (!hasWhatsAppPhone(phone)) {
      phone = toMetaPhone(await recoverMissingShopifyPhone({ id: order.shopify_order_id }))
      if (hasWhatsAppPhone(phone)) {
        await admin
          .from('contacts')
          .update({ phone, updated_at: new Date().toISOString() })
          .eq('id', order.contact_id)
      }
    }
    if (!hasWhatsAppPhone(phone)) {
      return NextResponse.json(
        { error: 'Contact has no WhatsApp number. Add a mobile on the contact, then retry.' },
        { status: 422 },
      )
    }

    const isCod =
      String(order.financial_status || '').startsWith('cod_') ||
      isShopifyCodOrder({ financial_status: order.financial_status })

    const notifyRes = await enqueueShopifyNotification(
      admin,
      accountId,
      order.contact_id,
      phone,
      'order_created',
      {
        customer_name: String(contact?.name || 'Customer').split(' ')[0],
        order_number: String(order.order_number || ''),
        total_price: Number(order.total_price || 0).toFixed(2),
        is_cod: isCod,
        shopify_order_id: String(order.shopify_order_id),
      },
    )

    if (notifyRes.status === 'error') {
      return NextResponse.json({ error: notifyRes.message || 'Failed to queue WhatsApp' }, { status: 422 })
    }

    const result = await processWhatsAppSendJobs({
      supabase: admin,
      jobIds: notifyRes.jobIds,
    })

    if (result.processed < 1 && notifyRes.jobIds.length > 0) {
      const { data: job } = await admin
        .from('whatsapp_send_jobs')
        .select('last_error, status')
        .eq('id', notifyRes.jobIds[0])
        .maybeSingle()
      if (job?.status !== 'sent') {
        return NextResponse.json(
          { error: job?.last_error || 'WhatsApp send failed' },
          { status: 422 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      jobs: notifyRes.jobIds.length,
      processed: result.processed,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
