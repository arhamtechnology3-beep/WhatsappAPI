/**
 * Load KB rows, answer product inquiries, learn unmatched questions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText } from '@/lib/flows/meta-send'
import {
  buildCombinedReply,
  defaultCatalogReply,
  hasUsableContactName,
  isProductInquiry,
  type KnowledgeRow,
} from './product-inquiry'

export type AnswerProductInquiryArgs = {
  db: SupabaseClient
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  text: string
  contactName?: string | null
}

export type AnswerProductInquiryResult =
  | { answered: true; matchedIds: string[]; pendingId?: string }
  | { answered: false; reason: string }

async function loadActiveKnowledge(
  db: SupabaseClient,
  accountId: string,
): Promise<KnowledgeRow[]> {
  const { data, error } = await db
    .from('bot_knowledge')
    .select('id, title, answer, keywords, pattern, status, hit_count')
    .eq('account_id', accountId)
    .eq('status', 'active')
  if (error) {
    console.error('[knowledge] load failed:', error.message)
    return []
  }
  return (data as KnowledgeRow[]) ?? []
}

async function bumpHits(db: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return
  const now = new Date().toISOString()
  for (const id of ids) {
    const { data } = await db
      .from('bot_knowledge')
      .select('hit_count')
      .eq('id', id)
      .maybeSingle()
    const next = ((data as { hit_count?: number } | null)?.hit_count ?? 0) + 1
    await db
      .from('bot_knowledge')
      .update({ hit_count: next, last_matched_at: now })
      .eq('id', id)
  }
}

/**
 * Store an unmatched (or newly seen) product question as pending so
 * operators can fill the answer and promote it to active.
 */
export async function learnPendingQuestion(
  db: SupabaseClient,
  args: {
    accountId: string
    question: string
    source?: string
  },
): Promise<string | null> {
  const q = args.question.trim().slice(0, 2000)
  if (!q) return null

  // Dedupe recent pending with same example_question.
  const { data: existing } = await db
    .from('bot_knowledge')
    .select('id')
    .eq('account_id', args.accountId)
    .eq('status', 'pending')
    .eq('example_question', q)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const keywords = q
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .slice(0, 12)

  const { data, error } = await db
    .from('bot_knowledge')
    .insert({
      account_id: args.accountId,
      title: `Pending: ${q.slice(0, 60)}`,
      answer: '',
      keywords,
      status: 'pending',
      source: args.source ?? 'chat_learn',
      example_question: q,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[knowledge] learnPending failed:', error.message)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

/**
 * If `text` is a product inquiry, send a KB (or default catalog) reply,
 * mark the conversation pending for a human follow-up, and learn gaps.
 */
export async function answerProductInquiry(
  args: AnswerProductInquiryArgs,
): Promise<AnswerProductInquiryResult> {
  const text = (args.text || '').trim()
  if (!isProductInquiry(text)) {
    return { answered: false, reason: 'not_product_inquiry' }
  }

  const rows = await loadActiveKnowledge(args.db, args.accountId)
  const combined = buildCombinedReply(text, rows, {
    contactName: args.contactName,
  })

  const replyText =
    combined?.answer ??
    defaultCatalogReply(
      hasUsableContactName(args.contactName) ? args.contactName : null,
    )
  const matchedIds = combined?.matchedIds ?? []

  try {
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: replyText,
    })
  } catch (err) {
    console.error(
      '[knowledge] send failed:',
      err instanceof Error ? err.message : err,
    )
    return { answered: false, reason: 'send_failed' }
  }

  await bumpHits(args.db, matchedIds)

  // Always flag for a human — KB covers the FAQ; closing the sale is agent work.
  await args.db
    .from('conversations')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', args.conversationId)

  let pendingId: string | undefined
  if (matchedIds.length === 0) {
    pendingId =
      (await learnPendingQuestion(args.db, {
        accountId: args.accountId,
        question: text,
        source: 'chat_learn',
      })) ?? undefined
  }

  return { answered: true, matchedIds, pendingId }
}
