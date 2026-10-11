import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText } from '@/lib/automations/meta-send'

const DEFAULT_SUPPORT_PHONE = '919167623044'
const DEFAULT_SUPPORT_NAME = 'Arham Food'
const RESEND_WINDOW_MS = 6 * 60 * 60 * 1000

export function supportContact(): { name: string; phone: string; display: string } {
  const phone = (process.env.SUPPORT_CONTACT_PHONE || DEFAULT_SUPPORT_PHONE).replace(/\D/g, '')
  const name = process.env.SUPPORT_CONTACT_NAME || DEFAULT_SUPPORT_NAME
  const local = phone.length === 12 && phone.startsWith('91') ? phone.slice(2) : phone
  const display =
    local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : `+${phone}`
  return { name, phone, display }
}

export function supportContactMessage(): string {
  const { name, display } = supportContact()
  return [
    'Hamari team aapki madad ke liye ready hai 🙏',
    '',
    `📞 Call / WhatsApp: ${display} (${name})`,
    '',
    'Aap yahin message bhi chhod sakte hain — team jaldi reply karegi.',
  ].join('\n')
}

const AGENT_PATTERNS: RegExp[] = [
  /\b(talk|speak|connect|chat)\s+(to|with)\s+(an?\s+|the\s+|your\s+)?(agent|human|person|someone|somebody|team|support|executive|customer care|owner|manager)\b/i,
  /\b(agent|human|customer care|customer support|helpline|executive)\b/i,
  /\b(call me|call back|callback|call karo|call kijiye|call karein|call kar do)\b/i,
  /\b(phone|call)\s*(pe|par|per)\s*(baat|bat)\b/i,
  /\b(baat|bat)\s*(karni|karna|karvao|karwao|kara do)\b/i,
  /(बात\s*कर|एजेंट|नंबर\s*भेज|कॉल\s*कर|વાત\s*કર|નંબર\s*મોકલ)/,
]

/** Asking for *our* number — ignored when the customer is sharing theirs. */
const NUMBER_REQUEST_PATTERNS: RegExp[] = [
  /\b(phone|contact|mobile|whatsapp|helpline|support|your|aapka|apka|tumhara)\s*(no\.?|number|nmbr)\b/i,
  /\b(no\.?|number|nmbr)\s*(bhejo|bhej do|do|dijiye|dena|send|share|chahiye|please)\b/i,
]

const CONTAINS_PHONE = /(?:\d[\s-]?){10,}/

/** Typed text or a tapped button that asks for a human. */
export function isAgentRequest(text: string | null | undefined): boolean {
  const s = (text || '').trim()
  if (!s) return false
  if (AGENT_PATTERNS.some((re) => re.test(s))) return true
  return !CONTAINS_PHONE.test(s) && NUMBER_REQUEST_PATTERNS.some((re) => re.test(s))
}

/**
 * Send the support number once per conversation per 6h and flag the chat
 * as pending so it shows up for the team. Never throws.
 */
export async function sendSupportContact(
  db: SupabaseClient,
  args: {
    accountId: string
    userId: string
    conversationId: string
    contactId: string
  },
): Promise<{ sent: boolean }> {
  try {
    await db
      .from('conversations')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', args.conversationId)

    const { display } = supportContact()
    const since = new Date(Date.now() - RESEND_WINDOW_MS).toISOString()
    const { data: recent } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', args.conversationId)
      .ilike('content_text', `%${display}%`)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()
    if (recent) return { sent: false }

    await engineSendText({ ...args, text: supportContactMessage() })
    return { sent: true }
  } catch (err) {
    console.error(
      '[support] failed to send support contact:',
      err instanceof Error ? err.message : err,
    )
    return { sent: false }
  }
}
