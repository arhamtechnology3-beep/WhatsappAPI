import type { SupabaseClient } from '@supabase/supabase-js'
import { formatItemsSummary } from './product-image'
import { isShopifyCodOrder } from './order-notify'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

export const OWNER_ORDER_TEMPLATE = 'wacrm_owner_new_order_v1'
/** v1 sat in Meta review (7 variables, little fixed text); v2 greets the owner by name. */
export const OWNER_ORDER_TEMPLATE_V2 = 'wacrm_owner_new_order_v2'

const DEFAULT_OWNER_RECIPIENTS = 'Vidhi:9004300378,Naman Boss:9029498911,Jesal:9769104020'

/** Submitted to Meta as a UTILITY template; {{n}} order matches ownerOrderAlertParams. */
export const OWNER_ORDER_TEMPLATE_BODY = [
  'New order received 🛒',
  '',
  'Order: {{1}}',
  'Customer: {{2}}',
  'Mobile: {{3}}',
  'Items: {{4}}',
  'Total: {{5}}',
  'Payment: {{6}}',
  'Ship to: {{7}}',
  '',
  'Please pack and dispatch this order.',
].join('\n')

export const OWNER_ORDER_TEMPLATE_SAMPLE = [
  'DP/26/1017',
  'Sudha Balachandran',
  '+91 98215 14956',
  'Gunda Keri | Lasode ka Achar (250 g) × 1, Gor Keri | Jaggery Mango Achar (250 g) × 1',
  '₹718.20',
  'Paid online',
  'Sai Villa, 20 Union Park, Sion Trombay Road, Chembur, Mumbai, Maharashtra 400071',
]

/** {{1}} is the owner's name; {{2}}–{{8}} are ownerOrderAlertParams. */
export const OWNER_ORDER_TEMPLATE_V2_BODY = [
  'Hi {{1}}, a new order has been placed on DivyaPrabha Foods 🛒',
  '',
  'Order: {{2}}',
  'Customer: {{3}}',
  'Mobile: {{4}}',
  'Items: {{5}}',
  'Total: {{6}}',
  'Payment: {{7}}',
  'Ship to: {{8}}',
  '',
  'Please pack this order and dispatch it within 24 hours. Reply here if anything about the order is unclear.',
].join('\n')

export const OWNER_ORDER_TEMPLATE_V2_FOOTER = 'DivyaPrabha Foods order alert'

export const OWNER_ORDER_TEMPLATE_V2_SAMPLE = ['Vidhi', ...OWNER_ORDER_TEMPLATE_SAMPLE]

export interface OwnerRecipient {
  name: string
  phone: string
}

/**
 * `SHOPIFY_OWNER_ALERT_PHONES` (comma separated `Name:phone` or bare
 * phone) or the three store owners. Bare phones are greeted as "Team".
 */
export function ownerAlertRecipients(): OwnerRecipient[] {
  const raw = process.env.SHOPIFY_OWNER_ALERT_PHONES || DEFAULT_OWNER_RECIPIENTS
  const out: OwnerRecipient[] = []
  for (const entry of raw.split(',')) {
    const [maybeName, maybePhone] = entry.includes(':') ? entry.split(':') : ['', entry]
    const phone = toMetaPhone((maybePhone || '').trim())
    if (!phone || out.some((r) => r.phone === phone)) continue
    out.push({ name: maybeName.trim() || 'Team', phone })
  }
  return out
}

export function ownerAlertPhones(): string[] {
  return ownerAlertRecipients().map((r) => r.phone)
}

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {})
const str = (v: unknown): string => (v == null ? '' : String(v).trim())

/** Meta rejects template parameters with newlines, tabs, or 4+ spaces, and empty values. */
function param(value: string, max = 300): string {
  const s = value.replace(/\s+/g, ' ').trim()
  if (!s) return '-'
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function displayPhone(raw: string): string {
  const digits = toMetaPhone(raw)
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  }
  return digits ? `+${digits}` : ''
}

function paymentLabel(order: Rec): string {
  if (isShopifyCodOrder(order)) return 'Cash on Delivery'
  const status = str(order.financial_status).toLowerCase()
  if (status === 'paid') return 'Paid online'
  if (!status) return ''
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

export function ownerOrderAlertParams(
  payload: unknown,
  fallback: { customerName?: string; phone?: string } = {},
): string[] {
  const order = rec(payload)
  const shipping = rec(order.shipping_address)
  const billing = rec(order.billing_address)
  const customer = rec(order.customer)
  const address = Object.keys(shipping).length ? shipping : billing

  const name =
    str(order.name) || (order.order_number != null ? `#${str(order.order_number)}` : '')
  const customerName =
    [str(address.first_name), str(address.last_name)].filter(Boolean).join(' ') ||
    [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(' ') ||
    fallback.customerName ||
    ''
  const phone = displayPhone(
    str(order.phone) || str(address.phone) || str(customer.phone) || fallback.phone || '',
  )
  const total = Number(order.total_price)
  const currency = str(order.currency) || 'INR'
  const totalLabel = Number.isFinite(total)
    ? `${currency === 'INR' ? '₹' : `${currency} `}${total.toFixed(2)}`
    : ''
  const shipTo = [
    str(address.address1),
    str(address.address2),
    str(address.city),
    [str(address.province), str(address.zip)].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  return [
    param(name),
    param(customerName),
    param(phone),
    param(formatItemsSummary(order.line_items, 8), 600),
    param(totalLabel),
    param(paymentLabel(order)),
    param(shipTo),
  ]
}

async function ownerContactId(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  owner: OwnerRecipient,
): Promise<string | null> {
  const { phone } = owner
  const local = phone.startsWith('91') ? phone.slice(2) : phone
  const { data: existing } = await db
    .from('contacts')
    .select('id, name')
    .eq('account_id', accountId)
    .in('phone', [phone, `+${phone}`, local])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    if (!existing.name || existing.name === 'Store owner') {
      await db.from('contacts').update({ name: owner.name }).eq('id', existing.id)
    }
    return existing.id
  }
  const { data: created, error } = await db
    .from('contacts')
    .insert({ account_id: accountId, user_id: userId, phone, name: owner.name })
    .select('id')
    .single()
  if (error) {
    console.error('[owner-order-alert] contact insert failed:', phone, error.message)
    return null
  }
  return created.id
}

/** v2 when approved, else v1 when approved, else null. */
export function pickOwnerTemplate(
  statuses: Array<{ name: string; status: string | null }>,
): string | null {
  const approved = new Set(
    statuses.filter((t) => String(t.status || '').toUpperCase() === 'APPROVED').map((t) => t.name),
  )
  if (approved.has(OWNER_ORDER_TEMPLATE_V2)) return OWNER_ORDER_TEMPLATE_V2
  if (approved.has(OWNER_ORDER_TEMPLATE)) return OWNER_ORDER_TEMPLATE
  return null
}

/**
 * Queue the "new order" WhatsApp to every owner number, once per order.
 * Skipped until a template is APPROVED on the account. Never throws.
 */
export async function enqueueOwnerOrderAlerts(
  db: SupabaseClient,
  args: { accountId: string; userId: string; shopifyOrderId: string; params: string[] },
): Promise<string[]> {
  const jobIds: string[] = []
  try {
    const { data: templates } = await db
      .from('message_templates')
      .select('name, status')
      .eq('account_id', args.accountId)
      .in('name', [OWNER_ORDER_TEMPLATE, OWNER_ORDER_TEMPLATE_V2])
    const templateName = pickOwnerTemplate(templates || [])
    if (!templateName) {
      console.warn(`[owner-order-alert] no approved owner template; skipped order ${args.shopifyOrderId}`)
      return jobIds
    }

    for (const owner of ownerAlertRecipients()) {
      const { phone } = owner
      const contactId = await ownerContactId(db, args.accountId, args.userId, owner)
      if (!contactId) continue
      const { data: job, error } = await db
        .from('whatsapp_send_jobs')
        .insert({
          account_id: args.accountId,
          contact_id: contactId,
          template_name: templateName,
          template_params:
            templateName === OWNER_ORDER_TEMPLATE_V2 ? [owner.name, ...args.params] : args.params,
          status: 'pending',
          run_at: new Date().toISOString(),
          idempotency_key: `owner_new_order:${args.shopifyOrderId}:${phone}`,
        })
        .select('id')
        .single()
      if (job?.id) jobIds.push(job.id)
      else if (error && !/duplicate key|23505/i.test(`${error.code} ${error.message}`)) {
        console.error('[owner-order-alert] job insert failed:', phone, error.message)
      }
    }
  } catch (err) {
    console.error(
      '[owner-order-alert] failed:',
      err instanceof Error ? err.message : err,
    )
  }
  return jobIds
}
