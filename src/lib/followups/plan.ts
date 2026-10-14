import { randomBytes } from 'node:crypto'
import { clampToIstSendWindow } from '@/lib/shopify/send-window'
import { storefrontBaseUrl } from '@/lib/shopify/whatsapp-template-library'

export type FollowupStage =
  | 'review_request'
  | 'review_reminder'
  | 'refill'
  | 'refill_followup'
  | 'done'

export interface FollowupVariant {
  variant_id: string
  quantity: number
}

/** One distinct product of the order (variants of the same pickle merged). */
export interface FollowupProduct {
  product_id: string | null
  title: string
  handle: string | null
  image_url: string | null
  variants: FollowupVariant[]
  opened_at?: string | null
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const REVIEW_REQUEST_DELAY_MS = 24 * HOUR_MS
export const REVIEW_REMINDER_DELAY_MS = 72 * HOUR_MS
export const REFILL_AFTER_MS = 30 * DAY_MS
export const REFILL_FOLLOWUP_AFTER_MS = 45 * DAY_MS
/** Deliveries we learn about later than this skip straight to the refill. */
export const REVIEW_MAX_AGE_MS = 10 * DAY_MS
/** Past this, a refill nudge reads as random spam. */
export const REFILL_MAX_AGE_MS = 60 * DAY_MS

/**
 * Review pages for the store's pickles, used when the storefront catalog
 * lookup by product id fails (product unpublished, catalog fetch down).
 */
export const KNOWN_REVIEW_HANDLES: Readonly<Record<string, string>> = {
  'homemade mango pickle': 'mango-pickle-traditional-keri-achar-gujarati',
  'meethi keri': 'sweet-mango-pickle-meethi-keri-achar-homemade',
  chhundo: 'chhundo-pickle-sweet-shredded-mango-achar-gujarati',
  'gor keri': 'gor-keri-pickle-jaggery-mango-achar-gujarati',
  'gunda keri': 'gunda-keri-pickle-lasode-ka-achar-gujarati',
  'katka keri': 'katka-keri-pickle-homemade-gujarati-mango-achar',
  'methia keri': 'chana-keri-methi-pickle-gujarati-methia-achar',
}

/** "Gunda Keri | Lasode ka Achar" → "Gunda Keri". */
export function shortProductName(title: string): string {
  return title.split('|')[0].replace(/\s+/g, ' ').trim()
}

export function knownReviewHandle(title: string): string | null {
  return KNOWN_REVIEW_HANDLES[shortProductName(title).toLowerCase()] ?? null
}

/** "Gunda Keri", "Gunda Keri aur Gor Keri", "A, B aur C", "A, B, C + 2 more". */
export function joinProductNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length <= 1) return clean[0] || 'aapka order'
  if (clean.length > 4) return `${clean.slice(0, 3).join(', ')} + ${clean.length - 3} more`
  return `${clean.slice(0, -1).join(', ')} aur ${clean[clean.length - 1]}`
}

function numericId(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw)
  const gid = s.match(/\/(\d+)$/)
  if (gid) return gid[1]
  return /^\d+$/.test(s) ? s : null
}

/** Distinct products of a Shopify order, without handles (resolved later). */
export function followupProductsFromLineItems(lineItems: unknown): FollowupProduct[] {
  if (!Array.isArray(lineItems)) return []
  const byKey = new Map<string, FollowupProduct>()
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (item.gift_card === true) continue
    const title = String(item.title || item.name || '').trim()
    if (!title) continue
    const productId = numericId(item.product_id)
    const key = productId || shortProductName(title).toLowerCase()
    const product =
      byKey.get(key) ||
      ({
        product_id: productId,
        title: shortProductName(title),
        handle: null,
        image_url: typeof item.image_url === 'string' ? item.image_url : null,
        variants: [],
      } satisfies FollowupProduct)
    const variantId = numericId(item.variant_id)
    const quantity = Math.max(1, Number(item.quantity) || 1)
    if (variantId) {
      const existing = product.variants.find((v) => v.variant_id === variantId)
      if (existing) existing.quantity += quantity
      else product.variants.push({ variant_id: variantId, quantity })
    }
    byKey.set(key, product)
  }
  return [...byKey.values()]
}

export function reviewUrl(handle: string): string {
  return `${storefrontBaseUrl()}/products/${encodeURIComponent(handle)}?review=1`
}

export function reviewableProducts(products: FollowupProduct[]): FollowupProduct[] {
  return products.filter((p) => !!p.handle)
}

export function unopenedReviewProducts(products: FollowupProduct[]): FollowupProduct[] {
  return reviewableProducts(products).filter((p) => !p.opened_at)
}

/**
 * Shopify cart permalink with the same variants and quantities
 * (`cart/123:1,456:2`), dropping variants that are sold out.
 */
export function reorderCartPath(
  products: FollowupProduct[],
  soldOutVariantIds: ReadonlySet<string> = new Set(),
): string | null {
  const parts: string[] = []
  for (const product of products) {
    for (const v of product.variants) {
      if (soldOutVariantIds.has(v.variant_id)) continue
      parts.push(`${v.variant_id}:${v.quantity}`)
    }
  }
  return parts.length ? `cart/${parts.join(',')}` : null
}

export function newFollowupToken(): string {
  return randomBytes(9).toString('base64url')
}

export interface StagePlan {
  stage: FollowupStage
  next_run_at: Date | null
}

const at = (ms: number) => clampToIstSendWindow(new Date(ms))

/** Where a newly delivered order starts. Null when it is too old for any follow-up. */
export function initialPlan(
  deliveredAt: Date,
  now: Date,
  hasReviewProducts: boolean,
): StagePlan | null {
  const delivered = deliveredAt.getTime()
  const nowMs = now.getTime()
  if (hasReviewProducts && nowMs - delivered < REVIEW_MAX_AGE_MS) {
    return {
      stage: 'review_request',
      next_run_at: at(Math.max(delivered + REVIEW_REQUEST_DELAY_MS, nowMs)),
    }
  }
  if (nowMs - delivered < REFILL_FOLLOWUP_AFTER_MS) {
    return {
      stage: 'refill',
      next_run_at: at(Math.max(delivered + REFILL_AFTER_MS, nowMs)),
    }
  }
  return null
}

/** The stage after `stage` has been sent or skipped at `now`. */
export function nextPlan(stage: FollowupStage, deliveredAt: Date, now: Date): StagePlan {
  const delivered = deliveredAt.getTime()
  const nowMs = now.getTime()
  switch (stage) {
    case 'review_request':
      return { stage: 'review_reminder', next_run_at: at(nowMs + REVIEW_REMINDER_DELAY_MS) }
    case 'review_reminder':
      return {
        stage: 'refill',
        next_run_at: at(Math.max(delivered + REFILL_AFTER_MS, nowMs + 3 * DAY_MS)),
      }
    case 'refill':
      return {
        stage: 'refill_followup',
        next_run_at: at(Math.max(delivered + REFILL_FOLLOWUP_AFTER_MS, nowMs + 10 * DAY_MS)),
      }
    default:
      return { stage: 'done', next_run_at: null }
  }
}

/** A stage that has been waiting too long (template not approved, retries) is dropped. */
export function isStageStale(stage: FollowupStage, deliveredAt: Date, now: Date): boolean {
  const age = now.getTime() - deliveredAt.getTime()
  if (stage === 'review_request' || stage === 'review_reminder') return age > REVIEW_MAX_AGE_MS
  if (stage === 'refill' || stage === 'refill_followup') return age > REFILL_MAX_AGE_MS
  return false
}
