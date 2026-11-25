import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET  /api/knowledge — list bot_knowledge for the caller's account
 * POST /api/knowledge — create a knowledge row (agent+)
 * PATCH /api/knowledge — update answer/status/keywords (agent+)
 */

async function requireAccount() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, status: 401, body: { error: 'Unauthorized' } }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return {
      ok: false as const,
      status: 403,
      body: { error: 'Your profile is not linked to an account.' },
    }
  }
  return { ok: true as const, supabase, accountId, userId: user.id }
}

export async function GET(request: Request) {
  const guard = await requireAccount()
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')

  let q = guard.supabase
    .from('bot_knowledge')
    .select('*')
    .eq('account_id', guard.accountId)
    .order('updated_at', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}

export async function POST(request: Request) {
  const guard = await requireAccount()
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status })

  const body = (await request.json().catch(() => null)) as {
    title?: string
    answer?: string
    keywords?: string[]
    pattern?: string | null
    status?: 'active' | 'pending' | 'archived'
    example_question?: string | null
  } | null

  if (!body?.title?.trim() || !body?.answer?.trim()) {
    return NextResponse.json(
      { error: 'title and answer are required' },
      { status: 400 },
    )
  }

  const { data, error } = await guard.supabase
    .from('bot_knowledge')
    .insert({
      account_id: guard.accountId,
      title: body.title.trim(),
      answer: body.answer.trim(),
      keywords: body.keywords ?? [],
      pattern: body.pattern ?? null,
      status: body.status ?? 'active',
      source: 'agent',
      example_question: body.example_question ?? null,
    })
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const guard = await requireAccount()
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status })

  const body = (await request.json().catch(() => null)) as {
    id?: string
    title?: string
    answer?: string
    keywords?: string[]
    pattern?: string | null
    status?: 'active' | 'pending' | 'archived'
  } | null

  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.answer !== undefined) patch.answer = body.answer
  if (body.keywords !== undefined) patch.keywords = body.keywords
  if (body.pattern !== undefined) patch.pattern = body.pattern
  if (body.status !== undefined) patch.status = body.status

  const { data, error } = await guard.supabase
    .from('bot_knowledge')
    .update(patch)
    .eq('id', body.id)
    .eq('account_id', guard.accountId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: data })
}
