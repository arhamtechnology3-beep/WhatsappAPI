import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/contacts/dedupe'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

type ContactRow = {
  id: string
  email: string | null
  phone: string | null
  name: string | null
  company: string | null
  shopify_customer_id: string | null
  marketing_opt_in: boolean | null
  created_at: string
  updated_at: string
}

function score(row: ContactRow): number {
  let s = 0
  if (toMetaPhone(row.phone || '')) s += 100
  if (row.shopify_customer_id) s += 20
  if (row.name && row.name !== 'Shopify Customer') s += 5
  return s
}

function pickSurvivor(rows: ContactRow[]): ContactRow {
  return [...rows].sort((a, b) => {
    const ds = score(b) - score(a)
    if (ds !== 0) return ds
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })[0]
}

async function repoint(
  db: SupabaseClient,
  survivorId: string,
  loserIds: string[]
): Promise<void> {
  const tables = [
    'conversations',
    'contact_notes',
    'deals',
    'broadcast_recipients',
    'automation_logs',
    'automation_pending_executions',
    'shopify_checkouts',
    'shopify_orders',
    'shopify_recovery_tracking',
    'opt_in_events',
    'whatsapp_send_jobs',
  ] as const

  for (const table of tables) {
    const { error } = await db
      .from(table)
      .update({ contact_id: survivorId })
      .in('contact_id', loserIds)
    if (error) {
      console.warn(`[merge-duplicates] ${table} re-point:`, error.message)
    }
  }

  const { data: loserTags } = await db
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', survivorId)
  const have = new Set((loserTags ?? []).map((t) => t.tag_id as string))
  const { data: extraTags } = await db
    .from('contact_tags')
    .select('tag_id')
    .in('contact_id', loserIds)
  const toAdd = [...new Set((extraTags ?? []).map((t) => t.tag_id as string))].filter(
    (id) => !have.has(id)
  )
  if (toAdd.length > 0) {
    await db.from('contact_tags').insert(toAdd.map((tag_id) => ({ contact_id: survivorId, tag_id })))
  }
  await db.from('contact_tags').delete().in('contact_id', loserIds)

  await db.from('contact_custom_values').delete().in('contact_id', loserIds)

  await db.from('flow_runs').update({ contact_id: survivorId }).in('contact_id', loserIds).neq('status', 'active')

  const { data: survivorSource } = await db
    .from('conversation_sources')
    .select('id')
    .eq('contact_id', survivorId)
    .limit(1)
  if (survivorSource && survivorSource.length > 0) {
    await db.from('conversation_sources').delete().in('contact_id', loserIds)
  } else {
    await db.from('conversation_sources').update({ contact_id: survivorId }).in('contact_id', loserIds)
  }
}

async function foldGroup(db: SupabaseClient, rows: ContactRow[]): Promise<number> {
  if (rows.length < 2) return 0
  const survivor = pickSurvivor(rows)
  const losers = rows.filter((r) => r.id !== survivor.id)
  const loserIds = losers.map((r) => r.id)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (!toMetaPhone(survivor.phone || '')) {
    const withPhone = losers.find((r) => toMetaPhone(r.phone || ''))
    if (withPhone?.phone) updates.phone = toMetaPhone(withPhone.phone)
  }
  if (!survivor.email) {
    const withEmail = losers.find((r) => normalizeEmail(r.email || ''))
    if (withEmail?.email) updates.email = normalizeEmail(withEmail.email)
  } else {
    updates.email = normalizeEmail(survivor.email)
  }
  if (!survivor.shopify_customer_id) {
    const withShopify = losers.find((r) => r.shopify_customer_id)
    if (withShopify?.shopify_customer_id) updates.shopify_customer_id = withShopify.shopify_customer_id
  }
  if (!survivor.company) {
    const withCompany = losers.find((r) => r.company)
    if (withCompany?.company) updates.company = withCompany.company
  }
  if (!survivor.name || survivor.name === 'Shopify Customer') {
    const withName = losers.find((r) => r.name && r.name !== 'Shopify Customer')
    if (withName?.name) updates.name = withName.name
  }

  await db.from('contacts').update(updates).eq('id', survivor.id)
  await repoint(db, survivor.id, loserIds)
  const { error } = await db.from('contacts').delete().in('id', loserIds)
  if (error) {
    console.error('[merge-duplicates] delete losers failed:', error.message)
    return 0
  }
  return losers.length
}

/**
 * Collapse contacts that share an email or a normalized phone within one account.
 */
export async function mergeDuplicateContactsForAccount(
  db: SupabaseClient,
  accountId: string
): Promise<number> {
  const { data, error } = await db
    .from('contacts')
    .select(
      'id, email, phone, name, company, shopify_customer_id, marketing_opt_in, created_at, updated_at'
    )
    .eq('account_id', accountId)

  if (error || !data) {
    console.error('[merge-duplicates] load failed:', error?.message)
    return 0
  }

  const rows = data as ContactRow[]
  let merged = 0

  const byEmail = new Map<string, ContactRow[]>()
  for (const row of rows) {
    const key = normalizeEmail(row.email || '')
    if (!key) continue
    const list = byEmail.get(key) ?? []
    list.push(row)
    byEmail.set(key, list)
  }
  for (const group of byEmail.values()) {
    merged += await foldGroup(db, group)
  }

  const { data: remaining } = await db
    .from('contacts')
    .select(
      'id, email, phone, name, company, shopify_customer_id, marketing_opt_in, created_at, updated_at'
    )
    .eq('account_id', accountId)

  const byPhone = new Map<string, ContactRow[]>()
  for (const row of (remaining ?? []) as ContactRow[]) {
    const key = toMetaPhone(row.phone || '')
    if (!key) continue
    const list = byPhone.get(key) ?? []
    list.push(row)
    byPhone.set(key, list)
  }
  for (const group of byPhone.values()) {
    merged += await foldGroup(db, group)
  }

  return merged
}
