import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import { propagateTemplateApproval } from '@/lib/shopify/automation-bindings'

const META_API_BASE = 'https://graph.facebook.com/v21.0'
/** The tick runs every minute; Meta review takes minutes to hours. */
const SYNC_INTERVAL_MS = 15 * 60 * 1000

let lastSyncAt = 0

export interface PendingTemplateSyncResult {
  skipped?: 'throttled'
  checked: number
  updated: number
}

/**
 * Pull the review result for PENDING templates from Meta. Backstop for the
 * `message_template_status_update` webhook: alerts and drips gated on
 * APPROVED start even if that webhook never reaches us.
 */
export async function syncPendingTemplateStatuses(
  db: SupabaseClient,
  opts: { force?: boolean; now?: number } = {},
): Promise<PendingTemplateSyncResult> {
  const now = opts.now ?? Date.now()
  if (!opts.force && now - lastSyncAt < SYNC_INTERVAL_MS) {
    return { skipped: 'throttled', checked: 0, updated: 0 }
  }
  lastSyncAt = now

  const { data: rows } = await db
    .from('message_templates')
    .select('id, account_id, name, status, meta_template_id')
    .eq('status', 'PENDING')
    .not('meta_template_id', 'is', null)
    .limit(50)

  const result: PendingTemplateSyncResult = { checked: 0, updated: 0 }
  const tokens = new Map<string, string | null>()

  for (const row of rows || []) {
    const metaId = String(row.meta_template_id || '')
    if (!metaId || metaId.startsWith('dry-run')) continue

    if (!tokens.has(row.account_id)) {
      const { data: cfg } = await db
        .from('whatsapp_config')
        .select('access_token')
        .eq('account_id', row.account_id)
        .maybeSingle()
      tokens.set(row.account_id, cfg?.access_token ? decrypt(cfg.access_token) : null)
    }
    const token = tokens.get(row.account_id)
    if (!token) continue

    try {
      const res = await fetch(
        `${META_API_BASE}/${encodeURIComponent(metaId)}?fields=status,rejected_reason`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) continue
      const body = (await res.json()) as { status?: string; rejected_reason?: string }
      result.checked++
      if (!body.status) continue
      const status = normalizeStatus(body.status)
      if (status === row.status) continue

      await db
        .from('message_templates')
        .update({
          status,
          rejection_reason:
            status === 'REJECTED' ? body.rejected_reason || 'Rejected by Meta' : null,
          submission_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      await propagateTemplateApproval(db, row.account_id, row.name, status)
      result.updated++
    } catch (err) {
      console.warn(
        '[pending-template-sync] status check failed:',
        row.name,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return result
}
