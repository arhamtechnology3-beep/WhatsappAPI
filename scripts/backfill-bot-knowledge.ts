/**
 * Backfill bot_knowledge from past inbox chats.
 *
 * For each account:
 *  1. Ensures seed catalog / Mumbai / payment answers exist (migration 063).
 *  2. Scans recent customer messages that look like product inquiries.
 *  3. Pairs each with the next agent text reply in the same conversation
 *     (within 48h) and upserts as active knowledge (source=backfill).
 *  4. Unmatched product questions become pending rows for review.
 *
 * Usage (requires .env.local):
 *   npx tsx scripts/backfill-bot-knowledge.ts
 *   npx tsx scripts/backfill-bot-knowledge.ts --apply
 *   npx tsx scripts/backfill-bot-knowledge.ts --apply --days 90
 *
 * Default is dry-run (prints what would be learned).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
  isGreetingOnly,
  isProductInquiry,
} from '../src/lib/knowledge/product-inquiry'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const daysArg = process.argv.find((a) => a.startsWith('--days='))
const DAYS = Number(daysArg?.split('=')[1] || process.argv[process.argv.indexOf('--days') + 1]) || 120

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

function keywordsFrom(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .slice(0, 12)
}

async function main() {
  const db = admin()
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
  console.log(`backfill-bot-knowledge days=${DAYS} apply=${APPLY} since=${since}`)

  const { data: accounts, error: accErr } = await db.from('accounts').select('id, name')
  if (accErr) throw accErr

  let learned = 0
  let pending = 0
  let skipped = 0

  for (const account of accounts ?? []) {
    const { data: customerMsgs, error } = await db
      .from('messages')
      .select('id, conversation_id, content_text, created_at, conversations!inner(account_id)')
      .eq('sender_type', 'customer')
      .eq('content_type', 'text')
      .gte('created_at', since)
      .eq('conversations.account_id', account.id)
      .order('created_at', { ascending: true })
      .limit(2000)

    if (error) {
      console.error(`[${account.id}] messages query failed:`, error.message)
      continue
    }

    for (const msg of customerMsgs ?? []) {
      const text = String(msg.content_text || '').trim()
      if (!isProductInquiry(text) || isGreetingOnly(text)) {
        skipped += 1
        continue
      }

      const windowEnd = new Date(new Date(msg.created_at).getTime() + 48 * 60 * 60 * 1000).toISOString()
      const { data: agentReply } = await db
        .from('messages')
        .select('id, content_text, created_at')
        .eq('conversation_id', msg.conversation_id)
        .eq('sender_type', 'agent')
        .eq('content_type', 'text')
        .gt('created_at', msg.created_at)
        .lte('created_at', windowEnd)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      const answer = String(agentReply?.content_text || '').trim()
      // Skip bot-ish handoff / ask-name replies — those are not product answers.
      if (
        !answer ||
        /share your name|what'?s your name|chat with agent|tap \*chat/i.test(answer)
      ) {
        if (!APPLY) {
          console.log(`[pending] ${account.name || account.id}: ${text.slice(0, 80)}…`)
        } else {
          const { data: exists } = await db
            .from('bot_knowledge')
            .select('id')
            .eq('account_id', account.id)
            .eq('example_question', text.slice(0, 2000))
            .limit(1)
            .maybeSingle()
          if (!exists) {
            await db.from('bot_knowledge').insert({
              account_id: account.id,
              title: `Pending: ${text.slice(0, 60)}`,
              answer: '',
              keywords: keywordsFrom(text),
              status: 'pending',
              source: 'backfill',
              example_question: text.slice(0, 2000),
            })
            pending += 1
          }
        }
        continue
      }

      if (!APPLY) {
        console.log(`[learn] ${account.name || account.id}`)
        console.log(`  Q: ${text.slice(0, 100)}`)
        console.log(`  A: ${answer.slice(0, 100)}`)
        learned += 1
        continue
      }

      const { data: exists } = await db
        .from('bot_knowledge')
        .select('id')
        .eq('account_id', account.id)
        .eq('example_question', text.slice(0, 2000))
        .limit(1)
        .maybeSingle()
      if (exists) continue

      await db.from('bot_knowledge').insert({
        account_id: account.id,
        title: text.slice(0, 80),
        answer,
        keywords: keywordsFrom(text),
        status: 'active',
        source: 'backfill',
        example_question: text.slice(0, 2000),
      })
      learned += 1
    }
  }

  console.log(`done learned=${learned} pending=${pending} skipped_non_product≈${skipped}`)
  if (!APPLY) console.log('Dry-run only. Re-run with --apply to write rows.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
