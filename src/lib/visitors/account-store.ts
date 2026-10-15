import type { SupabaseClient } from '@supabase/supabase-js'
import type { VisitorStoreRow } from '@/lib/visitors/store-context'

/**
 * Map a CRM account_id to its primary store. Organization id ==
 * workspace id == account id (IdentityFlow 1:1 sync).
 */
export async function resolveStoreForAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<VisitorStoreRow | null> {
  const { data } = await supabase
    .from('stores')
    .select('id, organization_id, name, shop_domain, status')
    .eq('organization_id', accountId)
    .in('status', ['active', 'pending_install'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (data as VisitorStoreRow) || null
}
