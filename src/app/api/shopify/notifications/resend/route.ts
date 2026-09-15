import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processWhatsAppSendJobs } from '@/lib/whatsapp/process-send-jobs'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const jobId = String(body.job_id || '')
    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: job, error: jobErr } = await admin
      .from('whatsapp_send_jobs')
      .select('id, account_id, status')
      .eq('id', jobId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Send job not found' }, { status: 404 })
    }

    if (job.status === 'sent') {
      return NextResponse.json({ success: true, already_sent: true })
    }

    await admin
      .from('whatsapp_send_jobs')
      .update({
        status: 'pending',
        attempts: 0,
        last_error: null,
        run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', job.id)

    const result = await processWhatsAppSendJobs({ supabase: admin, jobIds: [job.id] })
    if (result.processed < 1) {
      const { data: refreshed } = await admin
        .from('whatsapp_send_jobs')
        .select('last_error, status')
        .eq('id', job.id)
        .maybeSingle()
      return NextResponse.json(
        {
          error: refreshed?.last_error || 'WhatsApp send failed. Check the job error.',
          status: refreshed?.status,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({ success: true, processed: result.processed })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
