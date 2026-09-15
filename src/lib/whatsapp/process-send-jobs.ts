import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { findOrCreateConversation } from '@/lib/inbox/find-or-create-conversation'
import { isCartSequenceTemplate } from '@/lib/shopify/sequence-dedupe'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'

/**
 * Send delay-0 jobs in the same Hostinger/Node process after the webhook
 * responds. Vercel cron is not available on Hostinger, so queue-only
 * transactional messages otherwise sit pending forever.
 */
export function scheduleImmediateWhatsAppJobs(jobIds: string[]): void {
  const ids = jobIds.filter(Boolean)
  if (ids.length === 0) return

  const run = () =>
    processWhatsAppSendJobs({ jobIds: ids }).catch((err) => {
      console.error(
        '[process-send-jobs] immediate send failed:',
        err instanceof Error ? err.message : err,
      )
    })

  try {
    after(run)
  } catch {
    void run()
  }
}

export interface ProcessSendJobsResult {
  processed: number
  failed: number
}

function isPermanentSendError(message: string): boolean {
  return (
    message.includes('contact has no phone') ||
    message.includes('contact not found') ||
    message.includes('skipped: contact has no mobile') ||
    message.includes('#132001') ||
    message.includes('skipped_no_consent') ||
    message.includes('WhatsApp not configured')
  )
}

/**
 * Drain pending/failed WhatsApp template jobs. Used by the Hostinger-safe
 * webhook `after()` hook (delay-0 transactional sends) and by the cron retry
 * sweep.
 */
export async function processWhatsAppSendJobs(opts?: {
  jobIds?: string[]
  limit?: number
  supabase?: SupabaseClient
}): Promise<ProcessSendJobsResult> {
  const supabase = opts?.supabase || supabaseAdmin()
  const now = new Date().toISOString()
  let query = supabase
    .from('whatsapp_send_jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('attempts', 3)
    .lte('run_at', now)
    .order('created_at', { ascending: true })
    .limit(opts?.limit ?? 20)

  if (opts?.jobIds && opts.jobIds.length > 0) {
    query = query.in('id', opts.jobIds)
  }

  const { data: jobs, error } = await query
  if (error) {
    console.error('[process-send-jobs] load failed:', error.message)
    return { processed: 0, failed: 0 }
  }
  if (!jobs || jobs.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0

  for (const job of jobs) {
    const nextAttempt = (job.attempts || 0) + 1
    const { data: claimed } = await supabase
      .from('whatsapp_send_jobs')
      .update({
        attempts: nextAttempt,
        last_error: 'sending',
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', job.id)
      .eq('attempts', job.attempts || 0)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    try {
      const { data: account } = await supabase
        .from('accounts')
        .select('owner_user_id')
        .eq('id', job.account_id)
        .single()

      const ownerUserId = account?.owner_user_id || job.account_id

      if (isCartSequenceTemplate(job.template_name || '')) {
        const { data: cartDrip } = await supabase
          .from('shopify_recovery_tracking')
          .select('id')
          .eq('contact_id', job.contact_id)
          .eq('status', 'in_progress')
          .limit(1)
          .maybeSingle()
        if (cartDrip) {
          await supabase
            .from('whatsapp_send_jobs')
            .update({
              status: 'sent',
              last_error: 'skipped_sequence_owns_cart_drip',
              updated_at: new Date().toISOString(),
            } as Record<string, unknown>)
            .eq('id', job.id)
          processed++
          continue
        }
      }
      const { data: jobContact } = await supabase
        .from('contacts')
        .select('phone')
        .eq('id', job.contact_id)
        .maybeSingle()

      const sendPhone =
        toMetaPhone(jobContact?.phone) || toMetaPhone(job.recipient_phone)
      if (!hasWhatsAppPhone(sendPhone)) {
        await supabase
          .from('whatsapp_send_jobs')
          .update({
            status: 'failed',
            attempts: 3,
            last_error: 'skipped: contact has no mobile number',
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq('id', job.id)
        failed++
        continue
      }

      if (!hasWhatsAppPhone(jobContact?.phone) && hasWhatsAppPhone(sendPhone)) {
        await supabase
          .from('contacts')
          .update({ phone: sendPhone, updated_at: new Date().toISOString() })
          .eq('id', job.contact_id)
      }

      const conv = await findOrCreateConversation(supabase, {
        accountId: job.account_id,
        userId: ownerUserId,
        contactId: job.contact_id,
      })
      if (!conv) {
        throw new Error('Failed to resolve conversation')
      }

      await engineSendTemplate({
        accountId: job.account_id,
        userId: ownerUserId,
        conversationId: conv.id,
        contactId: job.contact_id,
        templateName: job.template_name,
        params: (job.template_params as string[]) || [],
        toPhone: sendPhone,
      })

      await supabase
        .from('whatsapp_send_jobs')
        .update({
          status: 'sent',
          attempts: nextAttempt,
          last_error: null,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq('id', job.id)

      if (job.workflow_log_id) {
        await supabase
          .from('workflow_logs')
          .update({ status: 'sent' })
          .eq('id', job.workflow_log_id)
      }

      processed++
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[process-send-jobs] job ${job.id} failed:`, errMsg)
      const permanent = isPermanentSendError(errMsg)
      const attempts = permanent ? 3 : nextAttempt
      const backoffMinutes = 5 * nextAttempt
      const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

      await supabase
        .from('whatsapp_send_jobs')
        .update({
          status: 'failed',
          attempts,
          last_error: errMsg,
          run_at: nextRunAt,
        } as Record<string, unknown>)
        .eq('id', job.id)

      if (job.workflow_log_id) {
        await supabase
          .from('workflow_logs')
          .update({ status: 'failed', error_message: errMsg })
          .eq('id', job.workflow_log_id)
      }
      failed++
    }
  }

  return { processed, failed }
}
