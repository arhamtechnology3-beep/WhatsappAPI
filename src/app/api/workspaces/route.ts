import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

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
      .select('role, workspaces(id, name, slug, plan, status, default_currency)')
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const workspaces = (memberships ?? []).map((m: any) => ({
      id: m.workspaces.id,
      name: m.workspaces.name,
      slug: m.workspaces.slug,
      plan: m.workspaces.plan,
      status: m.workspaces.status,
      default_currency: m.workspaces.default_currency,
      role: m.role,
    }))

    return NextResponse.json({ workspaces })
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

    // Set as active workspace in cookies
    const cookieStore = await cookies()
    cookieStore.set('wacrm_active_workspace_id', workspace.id, { path: '/' })

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'owner',
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
