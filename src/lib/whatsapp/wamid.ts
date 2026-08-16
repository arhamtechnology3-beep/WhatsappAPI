/**
 * Meta WhatsApp message ids (`wamid.…`) as returned by Graph and as
 * echoed on status webhooks. Lookups must treat `wamid.ABC` and `ABC`
 * as the same key — a mismatch leaves the inbox stuck on 1 tick
 * (`sent`) even after Meta delivers or fails the message.
 */

export function normalizeWamid(id: string): string {
  return id.trim().replace(/^wamid\./i, '')
}

export function wamidLookupKeys(id: string): string[] {
  const trimmed = id.trim()
  if (!trimmed) return []
  const bare = normalizeWamid(trimmed)
  return [...new Set([trimmed, bare, bare ? `wamid.${bare}` : ''].filter(Boolean))]
}

export function wamidsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return normalizeWamid(a) === normalizeWamid(b)
}
