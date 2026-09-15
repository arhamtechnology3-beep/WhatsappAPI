import type { SupabaseClient } from '@supabase/supabase-js'

const CONTACT_ID_TABLES = [
  'shopify_checkouts',
  'shopify_orders',
  'shopify_recovery_tracking',
  'whatsapp_send_jobs',
  'workflow_logs',
  'deals',
  'contact_notes',
  'flow_runs',
  'opt_in_events',
  'broadcast_recipients',
  'conversation_sources',
  'contact_custom_values',
] as const

/**
 * Fold `fromId` into `intoId` (same person, usually email-only Shopify
 * row vs WhatsApp phone row), then delete the loser.
 */
export async function absorbContact(
  db: SupabaseClient,
  fromId: string,
  intoId: string,
): Promise<void> {
  if (!fromId || !intoId || fromId === intoId) return

  const { data: intoConvs } = await db
    .from('conversations')
    .select('id')
    .eq('contact_id', intoId)
    .limit(1)
  const intoConvId = intoConvs?.[0]?.id as string | undefined

  const { data: fromConvs } = await db
    .from('conversations')
    .select('id')
    .eq('contact_id', fromId)

  if (intoConvId && fromConvs?.length) {
    for (const conv of fromConvs) {
      await db
        .from('messages')
        .update({ conversation_id: intoConvId })
        .eq('conversation_id', conv.id)
      await db.from('conversations').delete().eq('id', conv.id)
    }
  } else {
    await db
      .from('conversations')
      .update({ contact_id: intoId })
      .eq('contact_id', fromId)
  }

  for (const table of CONTACT_ID_TABLES) {
    const { error } = await db
      .from(table)
      .update({ contact_id: intoId })
      .eq('contact_id', fromId)
    if (error) {
      console.warn(`[absorbContact] ${table}:`, error.message)
    }
  }

  const { data: tags } = await db
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', fromId)
  if (tags?.length) {
    await db.from('contact_tags').upsert(
      tags.map((t) => ({ contact_id: intoId, tag_id: t.tag_id })),
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
    )
    await db.from('contact_tags').delete().eq('contact_id', fromId)
  }

  const { error: delErr } = await db.from('contacts').delete().eq('id', fromId)
  if (delErr) {
    console.warn('[absorbContact] delete loser:', delErr.message)
  }
}
