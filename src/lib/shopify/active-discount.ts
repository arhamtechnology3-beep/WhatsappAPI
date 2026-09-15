import { fetchShopify } from '@/lib/shopify/shopify-client'

export type ActiveShopifyDiscount = {
  code: string
  title: string
  percentOff: number | null
  amountOff: number | null
  minSubtotal: number | null
}

const CACHE_TTL_MS = 60_000
let cache: { at: number; value: ActiveShopifyDiscount | null } | null = null

const ACTIVE_CODE_DISCOUNTS_QUERY = `
  query ActiveCodeDiscounts {
    codeDiscountNodes(first: 25, query: "status:active") {
      nodes {
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 5) {
              nodes { code }
            }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
                ... on DiscountAmount { amount { amount } }
              }
            }
            minimumRequirement {
              ... on DiscountMinimumSubtotal {
                greaterThanOrEqualToSubtotal { amount }
              }
            }
          }
          ... on DiscountCodeBxgy {
            title
            status
            startsAt
            endsAt
            codes(first: 5) { nodes { code } }
          }
          ... on DiscountCodeFreeShipping {
            title
            status
            startsAt
            endsAt
            codes(first: 5) { nodes { code } }
          }
        }
      }
    }
  }
`

type CodeNode = {
  code?: string | null
}

type DiscountValue = {
  percentage?: number | string | null
  amount?: { amount?: string | null } | null
}

type GraphqlDiscount = {
  __typename?: string
  title?: string | null
  status?: string | null
  startsAt?: string | null
  endsAt?: string | null
  codes?: { nodes?: CodeNode[] | null } | null
  customerGets?: { value?: DiscountValue | null } | null
  minimumRequirement?: {
    greaterThanOrEqualToSubtotal?: { amount?: string | null } | null
  } | null
}

export function pickActiveDiscountFromGraphql(payload: unknown): ActiveShopifyDiscount | null {
  const nodes =
    (payload as {
      data?: { codeDiscountNodes?: { nodes?: { codeDiscount?: GraphqlDiscount | null }[] } }
    })?.data?.codeDiscountNodes?.nodes ?? []

  const now = Date.now()
  const candidates: ActiveShopifyDiscount[] = []

  for (const node of nodes) {
    const d = node?.codeDiscount
    if (!d || (d.status && d.status !== 'ACTIVE')) continue
    if (d.startsAt && Date.parse(d.startsAt) > now) continue
    if (d.endsAt && Date.parse(d.endsAt) < now) continue
    const code = d.codes?.nodes?.find((c) => c.code?.trim())?.code?.trim()
    if (!code) continue

    const rawPct = d.customerGets?.value?.percentage
    let percentOff: number | null = null
    if (rawPct != null && rawPct !== '') {
      const n = Number(rawPct)
      if (!Number.isNaN(n) && n > 0) {
        percentOff = n <= 1 ? Math.round(n * 100) : n
      }
    }
    const rawAmt = d.customerGets?.value?.amount?.amount
    const amountOff = rawAmt != null && rawAmt !== '' ? Number(rawAmt) : null
    const rawMin = d.minimumRequirement?.greaterThanOrEqualToSubtotal?.amount
    const minSubtotal = rawMin != null && rawMin !== '' ? Number(rawMin) : null

    candidates.push({
      code,
      title: d.title || code,
      percentOff,
      amountOff: amountOff != null && !Number.isNaN(amountOff) ? amountOff : null,
      minSubtotal: minSubtotal != null && !Number.isNaN(minSubtotal) ? minSubtotal : null,
    })
  }

  if (candidates.length === 0) return null
  const withPercent = candidates.find((c) => c.percentOff != null)
  return withPercent ?? candidates[0]
}

export function formatDiscountOffer(
  discount: ActiveShopifyDiscount | null,
  cartTotal: number,
): string {
  const pct = discount?.percentOff ?? 10
  const min = discount?.minSubtotal ?? 749
  const code = discount?.code
  const withCode = code ? ` with code ${code}` : ''

  if (cartTotal >= min) {
    return `🎉 ${pct}% OFF${withCode} — apply at checkout!`
  }
  if (cartTotal > 0) {
    const remaining = Math.max(0, Math.ceil(min - cartTotal))
    return `✨ Add items worth ₹${remaining} for ${pct}% OFF${withCode} (min ₹${min})!`
  }
  return `🎁 ${pct}% OFF${withCode} on orders above ₹${min}!`
}

export async function fetchActiveShopifyDiscount(): Promise<ActiveShopifyDiscount | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value
  }

  let value: ActiveShopifyDiscount | null = null
  try {
    const payload = await fetchShopify('graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query: ACTIVE_CODE_DISCOUNTS_QUERY }),
    })
    if (payload?.errors) {
      console.warn('[active-discount] GraphQL errors:', payload.errors)
    }
    value = pickActiveDiscountFromGraphql(payload)
  } catch (err) {
    console.warn(
      '[active-discount] GraphQL fetch failed:',
      err instanceof Error ? err.message : err,
    )
  }

  if (!value) {
    try {
      value = await fetchActiveDiscountViaRest()
    } catch (err) {
      console.warn(
        '[active-discount] REST fallback failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  cache = { at: Date.now(), value }
  return value
}

async function fetchActiveDiscountViaRest(): Promise<ActiveShopifyDiscount | null> {
  const data = await fetchShopify('price_rules.json?limit=250')
  const now = Date.now()
  const rules = (data?.price_rules ?? []) as Array<{
    id: number
    title?: string
    value_type?: string
    value?: string
    starts_at?: string | null
    ends_at?: string | null
    prerequisite_subtotal_range?: { greater_than_or_equal_to?: string } | null
  }>

  const active = rules.filter((r) => {
    const started = !r.starts_at || Date.parse(r.starts_at) <= now
    const notEnded = !r.ends_at || Date.parse(r.ends_at) >= now
    return started && notEnded
  })

  for (const rule of active) {
    const codesRes = await fetchShopify(`price_rules/${rule.id}/discount_codes.json`)
    const code = (codesRes?.discount_codes ?? []).find(
      (c: { code?: string }) => c.code?.trim(),
    )?.code as string | undefined
    if (!code) continue

    const rawValue = Number(rule.value)
    const percentOff =
      rule.value_type === 'percentage' && !Number.isNaN(rawValue)
        ? Math.abs(rawValue)
        : null
    const amountOff =
      rule.value_type === 'fixed_amount' && !Number.isNaN(rawValue)
        ? Math.abs(rawValue)
        : null
    const minRaw = rule.prerequisite_subtotal_range?.greater_than_or_equal_to
    const minSubtotal = minRaw != null ? Number(minRaw) : null

    return {
      code,
      title: rule.title || code,
      percentOff,
      amountOff,
      minSubtotal: minSubtotal != null && !Number.isNaN(minSubtotal) ? minSubtotal : null,
    }
  }
  return null
}
