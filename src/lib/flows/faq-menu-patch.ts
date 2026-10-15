/**
 * DivyaPrabha does not offer returns. Migration 056 was meant to drop
 * "Returns & Refund" from the FAQ list, but live DB rows can still carry
 * it. Strip those rows in memory whenever a flow loads so the customer
 * never sees the option, even before SQL is re-applied.
 */

export interface PatchableNode {
  node_key: string
  node_type: string
  config: Record<string, unknown>
}

function isReturnsRow(row: Record<string, unknown>): boolean {
  const id = String(row.reply_id || row.id || '').toLowerCase()
  const title = String(row.title || '').toLowerCase()
  return (
    id === 'returns' ||
    id === 'return' ||
    id === 'refund' ||
    title.includes('return') ||
    title.includes('refund')
  )
}

/** Remove Returns & Refund (and similar) rows from send_list sections. */
export function stripReturnsRefundFromFaqMenu<T extends PatchableNode>(
  nodes: T[],
): T[] {
  let dirty = false
  const next = nodes.map((node) => {
    if (node.node_type !== 'send_list') return node
    const sections = Array.isArray(node.config.sections)
      ? (node.config.sections as Array<Record<string, unknown>>)
      : null
    if (!sections) return node

    const patchedSections = sections.map((section) => {
      const rows = Array.isArray(section.rows)
        ? (section.rows as Array<Record<string, unknown>>)
        : []
      const kept = rows.filter((r) => !isReturnsRow(r))
      if (kept.length === rows.length) return section
      dirty = true
      return { ...section, rows: kept }
    })

    if (!dirty) return node
    return {
      ...node,
      config: { ...node.config, sections: patchedSections },
    }
  })

  // Drop orphan return_info nodes so taps can't land there.
  const withoutReturn = next.filter((n) => n.node_key !== 'return_info')
  if (withoutReturn.length !== next.length) dirty = true

  return dirty ? withoutReturn : nodes
}
