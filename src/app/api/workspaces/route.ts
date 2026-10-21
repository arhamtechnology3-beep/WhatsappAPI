import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  OrganizationCapError,
  countOwnedOrganizations,
  resolveOrBootstrapOwnerSubscription,
} from '@/lib/billing/owner-subscription'
import { createOwnedWorkspace } from '@/lib/workspaces/create-owned-workspace'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: memberships, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id, name, slug, plan, status, default_currency, subscription_id)')
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Service role: claim/bootstrap login subscription for legacy orgs
    const admin = supabaseAdmin()
    const ownerSub = await resolveOrBootstrapOwnerSubscription(admin, user.id)
    const ownedCount = await countOwnedOrganizations(admin, user.id)

    // PostgREST may type the embedded `workspaces` relation as an array;
    // normalize to a single org row (one workspace per membership).
    const workspaces = (memberships ?? []).flatMap((m) => {
      const raw = m.workspaces as
        | {
            id: string
            name: string
            slug: string
            plan: string
            status: string
            default_currency: string
          }
        | Array<{
            id: string
            name: string
            slug: string
            plan: string
            status: string
            default_currency: string
          }>
        | null
      const ws = Array.isArray(raw) ? raw[0] : raw
      if (!ws?.id) return []
      return [
        {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          plan: ws.plan,
          status: ws.status,
          default_currency: ws.default_currency,
          role: m.role as string,
        },
      ]
    })

    return NextResponse.json({
      workspaces,
      subscription: ownerSub
        ? {
            status: ownerSub.status,
            planId: ownerSub.planId,
            maxOrganizations: ownerSub.maxOrganizations,
            ownedOrganizations: ownedCount,
            trialEnd: ownerSub.trialEnd?.toISOString() ?? null,
          }
        : null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name : ''
    if (!name.trim()) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    }

    // Authenticated user is verified above; writes use service role so
    // workspaces INSERT is not blocked by RLS (no membership yet).
    const result = await createOwnedWorkspace(supabaseAdmin(), {
      ownerUserId: user.id,
      name,
    })

    const cookieStore = await cookies()
    cookieStore.set('wacrm_active_workspace_id', result.workspace.id, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({
      success: true,
      workspace: result.workspace,
      subscription: result.subscription,
    })
  } catch (err: unknown) {
    if (err instanceof OrganizationCapError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
