import type { SupabaseClient } from '@supabase/supabase-js'
import { formatItemsSummary } from './product-image'
import { isShopifyCodOrder } from './order-notify'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

export const OWNER_ORDER_TEMPLATE = 'wacrm_owner_new_order_v1'

const DEFAULT_OWNER_PHONES = '9769104020,9167623044,9029498911'

/** Approved on Meta as a UTILITY template; {{n}} order matches ownerOrderAlertParams. */
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

/** `SHOPIFY_OWNER_ALERT_PHONES` (comma separated) or the three store owners. */
export function ownerAlertPhones(): string[] {
  const raw = process.env.SHOPIFY_OWNER_ALERT_PHONES || DEFAULT_OWNER_PHONES
  const phones = raw.split(',').map((p) => toMetaPhone(p.trim())).filter(Boolean)
  return [...new Set(phones)]
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
  phone: string,
): Promise<string | null> {
  const local = phone.startsWith('91') ? phone.slice(2) : phone
  const { data: existing } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .in('phone', [phone, `+${phone}`, local])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id
  const { data: created, error } = await db
    .from('contacts')
    .insert({ account_id: accountId, user_id: userId, phone, name: 'Store owner' })
    .select('id')
    .single()
  if (error) {
    console.error('[owner-order-alert] contact insert failed:', phone, error.message)
    return null
  }
  return created.id
}

/**
 * Queue the "new order" WhatsApp to every owner number, once per order.
 * Skipped until the template is APPROVED on the account. Never throws.
 */
export async function enqueueOwnerOrderAlerts(
  db: SupabaseClient,
  args: { accountId: string; userId: string; shopifyOrderId: string; params: string[] },
): Promise<string[]> {
  const jobIds: string[] = []
  try {
    const { data: template } = await db
      .from('message_templates')
      .select('status')
      .eq('account_id', args.accountId)
      .eq('name', OWNER_ORDER_TEMPLATE)
      .limit(1)
      .maybeSingle()
    if (String(template?.status || '').toUpperCase() !== 'APPROVED') {
      console.warn(`[owner-order-alert] ${OWNER_ORDER_TEMPLATE} not approved; skipped order ${args.shopifyOrderId}`)
      return jobIds
    }

    for (const phone of ownerAlertPhones()) {
      const contactId = await ownerContactId(db, args.accountId, args.userId, phone)
      if (!contactId) continue
      const { data: job, error } = await db
        .from('whatsapp_send_jobs')
        .insert({
          account_id: args.accountId,
          contact_id: contactId,
          template_name: OWNER_ORDER_TEMPLATE,
          template_params: args.params,
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
