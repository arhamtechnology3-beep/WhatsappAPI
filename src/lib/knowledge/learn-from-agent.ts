/**
 * When an agent free-texts a reply after a product question, promote
 * that Q&A into bot_knowledge so future inbounds can auto-answer.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isProductInquiry } from './product-inquiry'

function keywordsFrom(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .slice(0, 12)
}

export async function learnFromAgentReply(
  db: SupabaseClient,
  args: {
    accountId: string
    conversationId: string
    agentText: string
  },
): Promise<void> {
  const answer = args.agentText.trim()
  if (!answer || answer.length < 20) return
  if (/share your name|what'?s your name|chat with agent|tap \*chat/i.test(answer)) {
    return
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await db
    .from('messages')
    .select('content_text')
    .eq('conversation_id', args.conversationId)
    .eq('sender_type', 'customer')
    .eq('content_type', 'text')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)

  const question = (recent ?? [])
    .map((m) => String(m.content_text || '').trim())
    .find((t) => isProductInquiry(t))
  if (!question) return

  const { data: exists } = await db
    .from('bot_knowledge')
    .select('id, status')
    .eq('account_id', args.accountId)
    .eq('example_question', question.slice(0, 2000))
    .limit(1)
    .maybeSingle()

  if (exists?.id) {
    // Promote pending → active with the agent's answer.
    if ((exists as { status?: string }).status === 'pending' || !(exists as { status?: string }).status) {
      await db
        .from('bot_knowledge')
        .update({
          answer,
          status: 'active',
          source: 'agent',
          title: question.slice(0, 80),
        })
        .eq('id', exists.id)
    }
    return
  }

  await db.from('bot_knowledge').insert({
    account_id: args.accountId,
    title: question.slice(0, 80),
    answer,
    keywords: keywordsFrom(question),
    status: 'active',
    source: 'agent',
    example_question: question.slice(0, 2000),
  })
}
