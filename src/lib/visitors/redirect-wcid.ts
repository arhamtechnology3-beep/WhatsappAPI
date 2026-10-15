import type { SupabaseClient } from '@supabase/supabase-js'
import { appendWcid } from '@/lib/visitors/tokens'
import { ensureContactLinkToken } from '@/lib/visitors/tokens'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'

/** Append a fresh/existing wcid for this contact onto a storefront URL. */
export async function withContactWcid(
  supabase: SupabaseClient,
  opts: { accountId: string; contactId: string; url: string },
): Promise<string> {
  try {
    const store = await resolveStoreForAccount(supabase, opts.accountId)
    if (!store) return opts.url
    const token = await ensureContactLinkToken(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
      accountId: opts.accountId,
      contactId: opts.contactId,
    })
    if (!token) return opts.url
    return appendWcid(opts.url, token)
  } catch {
    return opts.url
  }
}
