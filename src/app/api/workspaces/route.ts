import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import {
  OrganizationCapError,
  attachOrganizationToOwnerSubscription,
  countOwnedOrganizations,
  getOwnerSubscription,
  organizationCreationAllowed,
} from '@/lib/billing/owner-subscription'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all workspaces the user is member of
    const { data: memberships, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id, name, slug, plan, status, default_currency, subscription_id)')
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ownerSub = await getOwnerSubscription(supabase, user.id)
    const ownedCount = await countOwnedOrganizations(supabase, user.id)

    const workspaces = (memberships ?? []).map((m: any) => ({
      id: m.workspaces.id,
      name: m.workspaces.name,
      slug: m.workspaces.slug,
      plan: m.workspaces.plan,
      status: m.workspaces.status,
      default_currency: m.workspaces.default_currency,
      role: m.role,
    }))

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name } = await request.json()
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    }

    // Cap check before create (owned count does not yet include this org)
    const ownerSub = await getOwnerSubscription(supabase, user.id)
    const ownedCount = await countOwnedOrganizations(supabase, user.id)
    const allowed = organizationCreationAllowed({
      subscription: ownerSub,
      ownedCount,
    })
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason }, { status: 403 })
    }

    // Generate unique slug
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    let slug = baseSlug
    let suffix = 1
    
    while (true) {
      const { data: existing } = await supabase
        .from('workspaces')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!existing) break
      slug = `${baseSlug}-${suffix++}`
    }

    // Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), slug })
      .select()
      .single()

    if (wsError || !workspace) {
      return NextResponse.json({ error: wsError?.message || 'Failed to create workspace' }, { status: 500 })
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      // Clean up workspace if membership addition fails
      await supabase.from('workspaces').delete().eq('id', workspace.id)
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    try {
      await attachOrganizationToOwnerSubscription(supabase, {
        ownerUserId: user.id,
        organizationId: workspace.id,
      })
    } catch (err) {
      await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id)
      await supabase.from('workspaces').delete().eq('id', workspace.id)
      if (err instanceof OrganizationCapError) {
        return NextResponse.json({ error: err.message }, { status: 403 })
      }
      throw err
    }

    // Set as active workspace in cookies
    const cookieStore = await cookies()
    cookieStore.set('wacrm_active_workspace_id', workspace.id, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })

    const refreshed = await getOwnerSubscription(supabase, user.id)
    const newOwnedCount = await countOwnedOrganizations(supabase, user.id)

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'owner',
      },
      subscription: refreshed
        ? {
            status: refreshed.status,
            planId: refreshed.planId,
            maxOrganizations: refreshed.maxOrganizations,
            ownedOrganizations: newOwnedCount,
          }
        : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
