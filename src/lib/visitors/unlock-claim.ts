import type { SupabaseClient } from '@supabase/supabase-js'
import { parseUnlockRefFromMessage, getOrCreateCaptureSettings } from '@/lib/visitors/capture-settings'
import { linkVisitorToContact } from '@/lib/visitors/identify'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

export type UnlockClaimResult =
  | { claimed: false }
  | {
      claimed: true
      alreadyClaimed: boolean
      discountCode: string
      replyText: string
    }

/**
 * If the inbound WhatsApp text contains `ref XXXXXX`, claim the unlock
 * request, link visitor → contact, record consent, and return the
 * free-form auto-reply text (24h window — no template needed).
 */
export async function claimWaUnlockFromInbound(
  supabase: SupabaseClient,
  opts: {
    accountId: string
    contactId: string
    phone: string
    messageText: string
  },
): Promise<UnlockClaimResult> {
  const ref = parseUnlockRefFromMessage(opts.messageText)
  if (!ref) return { claimed: false }

  const { data: req } = await supabase
    .from('wa_unlock_requests')
    .select('id, store_id, organization_id, visitor_id, claimed_at, expires_at, contact_id')
    .eq('ref_code', ref)
    .maybeSingle()

  if (!req) return { claimed: false }

  const now = new Date()
  if (new Date(req.expires_at).getTime() <= now.getTime()) {
    return { claimed: false }
  }

  const store =
    (await resolveStoreForAccount(supabase, opts.accountId)) ||
    ({
      id: req.store_id,
      organization_id: req.organization_id,
    } as { id: string; organization_id: string })

  const settings = await getOrCreateCaptureSettings(supabase, {
    storeId: store.id,
    organizationId: store.organization_id,
  })

  const phone = toMetaPhone(opts.phone) || opts.phone
  const alreadyClaimed = !!req.claimed_at

  if (!alreadyClaimed) {
    await supabase
      .from('wa_unlock_requests')
      .update({
        claimed_at: now.toISOString(),
        contact_id: opts.contactId,
      })
      .eq('id', req.id)
      .is('claimed_at', null)

    await linkVisitorToContact(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
      visitorId: req.visitor_id,
      phone,
      contactId: opts.contactId,
      source: 'wa_click',
    })

    await supabase
      .from('contacts')
      .update({
        marketing_opt_in: true,
        whatsapp_marketing_opt_in: true,
        marketing_opt_in_source: 'wa_unlock_popup',
        marketing_opt_in_at: now.toISOString(),
        marketing_opt_out_at: null,
      })
      .eq('id', opts.contactId)

    await supabase.from('consent_records').insert({
      store_id: store.id,
      organization_id: store.organization_id,
      subject_type: 'contact',
      subject_id: opts.contactId,
      purpose: 'whatsapp_marketing',
      status: 'granted',
      source: 'popup',
      recorded_at: now.toISOString(),
      metadata: {
        policy_version: settings.policy_version,
        ref_code: ref,
        visitor_id: req.visitor_id,
      },
    })

    await supabase.from('opt_in_events').insert({
      account_id: opts.accountId,
      contact_id: opts.contactId,
      event_type: 'opt_in',
      source: 'wa_unlock_popup',
      raw_payload: { ref_code: ref, message_text: opts.messageText },
    })
  }

  const code = settings.discount_code || 'DP10'
  const replyText = alreadyClaimed
    ? `Aapka WhatsApp number pehle se *activated* hai ✅\nAapka code: *${code}* — checkout pe apply karke discount lo.`
    : `Thank you! Aapka WhatsApp number ab is offer ke liye *activated* hai ✅\nAapka code hai *${code}* 🎁\nCheckout pe apply karo aur discount enjoy karo.`

  return {
    claimed: true,
    alreadyClaimed,
    discountCode: code,
    replyText,
  }
}
