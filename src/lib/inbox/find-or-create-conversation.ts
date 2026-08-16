import type { SupabaseClient } from '@supabase/supabase-js'
import { isUniqueViolation } from '@/lib/contacts/dedupe'

export interface ConversationLookupRow {
  id: string
  last_message_at?: string | null
  created_at?: string | null
}

/** Keep the thread that last had a message (then the oldest row). */
export function pickPreferredConversation<T extends ConversationLookupRow>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => {
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0
    if (tb !== ta) return tb - ta
    const ca = a.created_at ? Date.parse(a.created_at) : 0
    const cb = b.created_at ? Date.parse(b.created_at) : 0
    return ca - cb
  })[0]
}

/**
 * One inbox thread per contact. Looks up by (account, contact), inserts
 * if missing, and retries on a unique-constraint race.
 */
export async function findOrCreateConversation(
  db: SupabaseClient,
  args: { accountId: string; userId: string; contactId: string },
): Promise<{ id: string } | null> {
  const { accountId, userId, contactId } = args

  const { data: existingRows, error: findError } = await db
    .from('conversations')
    .select('id, last_message_at, created_at')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(5)

  if (findError) {
    console.error('[findOrCreateConversation] lookup failed:', findError.message)
  }

  const existing = pickPreferredConversation(existingRows ?? [])
  if (existing) return { id: existing.id }

  const { data: created, error } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
    })
    .select('id')
    .single()

  if (!error && created?.id) return { id: created.id }

  if (error && isUniqueViolation(error)) {
    const { data: raced } = await db
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .limit(1)
      .maybeSingle()
    if (raced?.id) return { id: raced.id }
  }

  if (error) {
    console.error('[findOrCreateConversation] insert failed:', error.message)
  }
  return created?.id ? { id: created.id } : null
}
