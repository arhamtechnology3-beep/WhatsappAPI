/**
 * Create a new store organization for a login, attach it to the owner
 * subscription, and return the workspace row.
 *
 * Uses the service-role client for writes so RLS does not block the
 * chicken-and-egg insert (workspace before membership). Callers must
 * authenticate the user first.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  OrganizationCapError,
  attachOrganizationToOwnerSubscription,
  countOwnedOrganizations,
  organizationCreationAllowed,
  resolveOrBootstrapOwnerSubscription,
} from '@/lib/billing/owner-subscription'

export type CreateOwnedWorkspaceResult = {
  workspace: {
    id: string
    name: string
    slug: string
    role: 'owner'
  }
  subscription: {
    status: string
    planId: string
    maxOrganizations: number
    ownedOrganizations: number
  } | null
}

export async function allocateUniqueWorkspaceSlug(
  db: SupabaseClient,
  name: string,
): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'store'
  let slug = baseSlug
  let suffix = 1
  for (;;) {
    const { data: existing } = await db
      .from('workspaces')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) return slug
    slug = `${baseSlug}-${suffix++}`
  }
}

export async function createOwnedWorkspace(
  db: SupabaseClient,
  opts: { ownerUserId: string; name: string },
): Promise<CreateOwnedWorkspaceResult> {
  const name = opts.name.trim()
  if (!name) throw new Error('Workspace name is required')

  const ownerSub = await resolveOrBootstrapOwnerSubscription(db, opts.ownerUserId)
  const ownedCount = await countOwnedOrganizations(db, opts.ownerUserId)
  const allowed = organizationCreationAllowed({
    subscription: ownerSub,
    ownedCount,
  })
  if (!allowed.ok) {
    throw new OrganizationCapError(allowed.reason)
  }

  const slug = await allocateUniqueWorkspaceSlug(db, name)

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({ name, slug })
    .select('id, name, slug')
    .single()

  if (wsError || !workspace) {
    throw new Error(wsError?.message || 'Failed to create workspace')
  }

  const { error: memberError } = await db.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: opts.ownerUserId,
    role: 'owner',
  })

  if (memberError) {
    await db.from('workspaces').delete().eq('id', workspace.id)
    throw new Error(memberError.message)
  }

  try {
    await attachOrganizationToOwnerSubscription(db, {
      ownerUserId: opts.ownerUserId,
      organizationId: workspace.id,
    })
  } catch (err) {
    await db.from('workspace_members').delete().eq('workspace_id', workspace.id)
    await db.from('workspaces').delete().eq('id', workspace.id)
    throw err
  }

  const refreshed = await resolveOrBootstrapOwnerSubscription(db, opts.ownerUserId)
  const newOwnedCount = await countOwnedOrganizations(db, opts.ownerUserId)

  return {
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
  }
}
