import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText } from '@/lib/automations/meta-send'
import { engineSendCtaUrl } from '@/lib/flows/meta-send'

const DEFAULT_SUPPORT_PHONE = '919167623044'
const DEFAULT_SUPPORT_NAME = 'Arham Food'
const RESEND_WINDOW_MS = 6 * 60 * 60 * 1000

const SUPPORT_TIME_ZONE = 'Asia/Kolkata'
const SUPPORT_OPEN_HOUR = 9
const SUPPORT_CLOSE_HOUR = 19
/** Sunday closed. */
const SUPPORT_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
const SUPPORT_HOURS_LABEL = 'Monday to Saturday, 9 AM - 7 PM'

export function supportContact(): { name: string; phone: string; display: string } {
  const phone = (process.env.SUPPORT_CONTACT_PHONE || DEFAULT_SUPPORT_PHONE).replace(/\D/g, '')
  const name = process.env.SUPPORT_CONTACT_NAME || DEFAULT_SUPPORT_NAME
  const local = phone.length === 12 && phone.startsWith('91') ? phone.slice(2) : phone
  const display =
    local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : `+${phone}`
  return { name, phone, display }
}

/** Agents chat Mon–Sat, 9 AM – 7 PM India time. */
export function isSupportOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SUPPORT_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  return SUPPORT_DAYS.has(weekday) && hour >= SUPPORT_OPEN_HOUR && hour < SUPPORT_CLOSE_HOUR
}

export type SupportReply =
  | { kind: 'chat'; body: string; footer: string; buttonText: string; url: string }
  | { kind: 'closed'; text: string }

/**
 * Open hours: a "Chat with Agent" button that opens a WhatsApp chat with
 * the support number (no number or call option in the text).
 * Closed: ask the customer to leave a message here.
 */
export function supportReply(now: Date = new Date()): SupportReply {
  if (!isSupportOpen(now)) {
    return {
      kind: 'closed',
      text: [
        `Our team is available ${SUPPORT_HOURS_LABEL}.`,
        '',
        'Please leave your message here and we will reply as soon as we are back 🙏',
      ].join('\n'),
    }
  }
  const { phone } = supportContact()
  return {
    kind: 'chat',
    body: [
      'Our team is here to help 🙏',
      '',
      'Tap *Chat with Agent* below to message our agent on WhatsApp.',
    ].join('\n'),
    footer: `Chat only · ${SUPPORT_HOURS_LABEL}`,
    buttonText: 'Chat with Agent',
    url: `https://wa.me/${phone}?text=${encodeURIComponent('Hi, I need some help')}`,
  }
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
 * Send the agent reply (chat button, or office-hours note when closed)
 * once per conversation per 6h and flag the chat as pending so it shows
 * up for the team. Never throws.
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

    const reply = supportReply()
    const marker = reply.kind === 'chat' ? reply.body : reply.text
    const since = new Date(Date.now() - RESEND_WINDOW_MS).toISOString()
    const { data: recent } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', args.conversationId)
      .eq('content_text', marker)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()
    if (recent) return { sent: false }

    if (reply.kind === 'closed') {
      await engineSendText({ ...args, text: reply.text })
      return { sent: true }
    }
    try {
      await engineSendCtaUrl({
        ...args,
        bodyText: reply.body,
        footerText: reply.footer,
        displayText: reply.buttonText,
        url: reply.url,
      })
    } catch (err) {
      console.error(
        '[support] chat button failed, sending link as text:',
        err instanceof Error ? err.message : err,
      )
      await engineSendText({
        ...args,
        text: [
          'Our team is here to help 🙏',
          '',
          `Chat with our agent on WhatsApp: ${reply.url}`,
          '',
          reply.footer,
        ].join('\n'),
      })
    }
    return { sent: true }
  } catch (err) {
    console.error(
      '[support] failed to send support contact:',
      err instanceof Error ? err.message : err,
    )
    return { sent: false }
  }
}
