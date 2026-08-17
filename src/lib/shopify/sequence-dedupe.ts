/**
 * Cart / browse drips must send each step once per contact.
 * Shopify can create several checkout rows for the same cart
 * (numeric id, token, cart_token), and Hostinger + overlapping
 * cron hits can process the same tracking twice.
 */

export type TrackingIdentity = {
  id: string
  contact_id: string
  sequence_id: string
  created_at: string
}

export function duplicateTrackingIdsToStop(
  rows: TrackingIdentity[],
): string[] {
  const newestFirst = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )
  const seen = new Set<string>()
  const stop: string[] = []
  for (const row of newestFirst) {
    const key = `${row.contact_id}:${row.sequence_id}`
    if (seen.has(key)) stop.push(row.id)
    else seen.add(key)
  }
  return stop
}

export function stepAlreadySent(
  metadata: unknown,
  step: number,
): boolean {
  const sent = (metadata as { sent_steps?: unknown } | null)?.sent_steps
  return Array.isArray(sent) && sent.some((s) => Number(s) === step)
}

export function metadataWithSentStep(
  metadata: unknown,
  step: number,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  const prev = Array.isArray(base.sent_steps)
    ? (base.sent_steps as unknown[]).map((s) => Number(s))
    : []
  if (prev.includes(step)) return base
  return { ...base, sent_steps: [...prev, step] }
}

export function isCartSequenceTemplate(templateName: string): boolean {
  const n = (templateName || '').toLowerCase()
  return n.includes('cart_abandoned') || n.includes('cart_reminder')
}
