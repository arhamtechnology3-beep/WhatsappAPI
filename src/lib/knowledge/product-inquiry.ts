/**
 * Product / catalog / delivery intent detection + knowledge matching.
 *
 * Design:
 *  - WhatsApp already sends `contacts[].profile.name` — never ask for name.
 *  - Free-form product questions are answered from `bot_knowledge`.
 *  - Unmatched product questions are stored as `pending` so agents can
 *    teach the bot (and backfill can learn from past chats).
 */

import { CUSTOMER_STOREFRONT_ORIGIN } from '@/lib/shopify/storefront-url'

/** Strong signal the customer is asking about products / buying / shipping. */
const PRODUCT_INQUIRY_PATTERNS: RegExp[] = [
  /\b(pickle|pickles|achar|achaar|jam|chutney|papad|product|products|items?|catalogue|catalog)\b/i,
  /\b(buy|purchase|order|price\s*list|complete\s*list|full\s*list|product\s*list)\b/i,
  /\b(deliver|delivery|shipping|ship|mumbai|residence|pincode|pin\s*code)\b/i,
  /\b(payment|pay\s*full|delivery\s*charges|cod)\b/i,
  /(खरीद|अचार|प्रॉडक्ट|डिलीवरी|भेज|लिस्ट|सूची|मुंबई)/,
  /(ખરીદ|અથાણું|ડિલિવરી|મુંબઈ|લિસ્ટ)/,
]

/** Greetings-only — not a product question by itself. */
const GREETING_ONLY =
  /^(hi|hello|hey|namaste|namaskar|jai\s*shree\s*krishna|good\s*(morning|afternoon|evening)|hii+|helo+)\s*[!.🙏🌹]*$/i

export function isGreetingOnly(text: string | null | undefined): boolean {
  return GREETING_ONLY.test((text || '').trim())
}

export function isProductInquiry(text: string | null | undefined): boolean {
  const s = (text || '').trim()
  if (!s || s.length < 3) return false
  if (isGreetingOnly(s)) return false
  return PRODUCT_INQUIRY_PATTERNS.some((re) => re.test(s))
}

export type KnowledgeRow = {
  id: string
  title: string
  answer: string
  keywords: string[] | null
  pattern: string | null
  status: string
  hit_count?: number | null
}

/** Score how well a KB row matches inbound text (0 = no match). */
export function scoreKnowledgeMatch(text: string, row: KnowledgeRow): number {
  const hay = text.toLowerCase()
  let score = 0

  if (row.pattern) {
    try {
      if (new RegExp(row.pattern, 'i').test(text)) score += 5
    } catch {
      // ignore bad patterns in DB
    }
  }

  for (const raw of row.keywords ?? []) {
    const kw = String(raw || '')
      .trim()
      .toLowerCase()
    if (!kw) continue
    if (hay.includes(kw)) score += kw.length >= 8 ? 3 : 2
  }

  return score
}

export function pickBestKnowledge(
  text: string,
  rows: KnowledgeRow[],
): KnowledgeRow | null {
  let best: KnowledgeRow | null = null
  let bestScore = 0
  for (const row of rows) {
    if (row.status !== 'active') continue
    const score = scoreKnowledgeMatch(text, row)
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }
  return bestScore > 0 ? best : null
}

/**
 * When several facets match (catalog + mumbai + payment), merge answers
 * so one reply covers the full customer message (like the Gaurang Vora chat).
 */
export function buildCombinedReply(
  text: string,
  rows: KnowledgeRow[],
  opts?: { contactName?: string | null },
): { answer: string; matchedIds: string[] } | null {
  const scored = rows
    .filter((r) => r.status === 'active')
    .map((r) => ({ row: r, score: scoreKnowledgeMatch(text, r) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  // Take top distinct titles (avoid near-duplicates), max 3 blocks.
  const usedTitles = new Set<string>()
  const blocks: string[] = []
  const matchedIds: string[] = []
  for (const { row } of scored) {
    if (usedTitles.has(row.title)) continue
    usedTitles.add(row.title)
    blocks.push(row.answer.trim())
    matchedIds.push(row.id)
    if (blocks.length >= 3) break
  }

  const name = (opts?.contactName || '').trim()
  const greet =
    name && !/^\+?\d[\d\s-]{6,}$/.test(name)
      ? `Namaste ${name.split(/\s+/)[0]} 🙏`
      : 'Jai Shree Krishna 🙏'

  // If the first block already starts with a greeting, don't double-greet.
  const body = blocks.join('\n\n---\n\n')
  const answer = /^(jai\s*shree|namaste)/i.test(body)
    ? body
    : `${greet}\n\n${body}`

  return { answer, matchedIds }
}

/** Fallback when KB is empty but intent is clearly product-related. */
export function defaultCatalogReply(contactName?: string | null): string {
  const name = (contactName || '').trim()
  const first =
    name && !/^\+?\d[\d\s-]{6,}$/.test(name) ? name.split(/\s+/)[0] : null
  const greet = first ? `Namaste ${first} 🙏` : 'Jai Shree Krishna 🙏'
  return `${greet}

Yes — we make handmade pickles and more. Full product list:
${CUSTOMER_STOREFRONT_ORIGIN}/collections/all-products

We deliver across India (including Mumbai) to your residence. Free shipping on 2×250g pickles or orders above ₹599; otherwise delivery charges as applicable. Full online payment is fine.

Reply with your pincode + the items you want and we will confirm the total.`
}

/** True when the contact already has a usable WhatsApp / CRM name. */
export function hasUsableContactName(name: string | null | undefined): boolean {
  const s = (name || '').trim()
  if (!s) return false
  if (/^\+?\d[\d\s-]{6,}$/.test(s)) return false
  return s.length >= 2
}
