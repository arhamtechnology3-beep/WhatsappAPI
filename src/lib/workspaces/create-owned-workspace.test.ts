import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  resolveOrBootstrapOwnerSubscription,
  countOwnedOrganizations,
  organizationCreationAllowed,
  attachOrganizationToOwnerSubscription,
} = vi.hoisted(() => ({
  resolveOrBootstrapOwnerSubscription: vi.fn(),
  countOwnedOrganizations: vi.fn(),
  organizationCreationAllowed: vi.fn(),
  attachOrganizationToOwnerSubscription: vi.fn(),
}))

vi.mock('@/lib/billing/owner-subscription', () => {
  class OrganizationCapError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'OrganizationCapError'
    }
  }
  return {
    OrganizationCapError,
    resolveOrBootstrapOwnerSubscription,
    countOwnedOrganizations,
    organizationCreationAllowed,
    attachOrganizationToOwnerSubscription,
  }
})

import {
  allocateUniqueWorkspaceSlug,
  createOwnedWorkspace,
} from './create-owned-workspace'
import { OrganizationCapError } from '@/lib/billing/owner-subscription'

type TableState = {
  workspaces: Array<{ id: string; name: string; slug: string }>
  workspace_members: Array<{
    workspace_id: string
    user_id: string
    role: string
  }>
}

function makeDb(state: TableState) {
  const api = {
    from(table: 'workspaces' | 'workspace_members') {
      if (table === 'workspace_members') {
        return {
          insert(row: Record<string, unknown>) {
            state.workspace_members.push({
              workspace_id: String(row.workspace_id),
              user_id: String(row.user_id),
              role: String(row.role),
            })
            return Promise.resolve({ error: null, data: row })
          },
          delete() {
            return {
              eq(col: string, val: string) {
                if (col === 'workspace_id') {
                  state.workspace_members = state.workspace_members.filter(
                    (m) => m.workspace_id !== val,
                  )
                }
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      return {
        select(_cols?: string) {
          return {
            eq(col: string, val: string) {
              return {
                maybeSingle: async () => {
                  if (col === 'slug') {
                    const row = state.workspaces.find((w) => w.slug === val)
                    return { data: row ?? null, error: null }
                  }
                  return { data: null, error: null }
                },
              }
            },
          }
        },
        insert(row: Record<string, unknown>) {
          return {
            select(_cols?: string) {
              return {
                single: async () => {
                  const created = {
                    id: `ws-${state.workspaces.length + 1}`,
                    name: String(row.name),
                    slug: String(row.slug),
                  }
                  state.workspaces.push(created)
                  return { data: created, error: null }
                },
              }
            },
          }
        },
        delete() {
          return {
            eq(col: string, val: string) {
              if (col === 'id') {
                state.workspaces = state.workspaces.filter((w) => w.id !== val)
              }
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }

  return api as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('allocateUniqueWorkspaceSlug', () => {
  it('uses a sanitized slug and increments on collision', async () => {
    const db = makeDb({
      workspaces: [{ id: '1', name: 'Pickle Affair', slug: 'pickle-affair' }],
      workspace_members: [],
    })
    await expect(allocateUniqueWorkspaceSlug(db, 'Pickle Affair')).resolves.toBe(
      'pickle-affair-1',
    )
    await expect(allocateUniqueWorkspaceSlug(db, 'New Store!')).resolves.toBe(
      'new-store',
    )
  })
})

describe('createOwnedWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveOrBootstrapOwnerSubscription.mockResolvedValue({
      id: 'sub-1',
      ownerUserId: 'user-1',
      organizationId: 'ws-1',
      storeId: null,
      planId: 'growth',
      status: 'TRIALING',
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 86400000),
      maxOrganizations: 3,
    })
    countOwnedOrganizations.mockResolvedValue(1)
    organizationCreationAllowed.mockReturnValue({ ok: true })
    attachOrganizationToOwnerSubscription.mockResolvedValue({})
  })

  it('creates workspace + owner membership when under plan cap', async () => {
    const state: TableState = { workspaces: [], workspace_members: [] }
    const db = makeDb(state)

    const result = await createOwnedWorkspace(db, {
      ownerUserId: 'user-1',
      name: 'Pickle Affair',
    })

    expect(result.workspace.name).toBe('Pickle Affair')
    expect(result.workspace.slug).toBe('pickle-affair')
    expect(result.workspace.role).toBe('owner')
    expect(state.workspaces).toHaveLength(1)
    expect(state.workspace_members).toEqual([
      {
        workspace_id: result.workspace.id,
        user_id: 'user-1',
        role: 'owner',
      },
    ])
    expect(attachOrganizationToOwnerSubscription).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        ownerUserId: 'user-1',
        organizationId: result.workspace.id,
      }),
    )
    expect(result.subscription?.maxOrganizations).toBe(3)
    expect(result.subscription?.ownedOrganizations).toBe(1)
  })

  it('rejects when plan does not allow another organization', async () => {
    organizationCreationAllowed.mockReturnValue({
      ok: false,
      reason: 'Your growth plan allows 3 store organization(s). Upgrade to add more.',
    })
    const db = makeDb({ workspaces: [], workspace_members: [] })

    await expect(
      createOwnedWorkspace(db, { ownerUserId: 'user-1', name: 'Pickle Affair' }),
    ).rejects.toBeInstanceOf(OrganizationCapError)
  })

  it('rolls back workspace if membership insert fails', async () => {
    const state: TableState = { workspaces: [], workspace_members: [] }
    const db = makeDb(state)
    const originalFrom = db.from.bind(db)
    db.from = ((table: string) => {
      if (table === 'workspace_members') {
        return {
          insert: async () => ({
            error: { message: 'new row violates row-level security policy' },
            data: null,
          }),
        }
      }
      return originalFrom(table as 'workspaces')
    }) as typeof db.from

    await expect(
      createOwnedWorkspace(db, { ownerUserId: 'user-1', name: 'Pickle Affair' }),
    ).rejects.toThrow(/row-level security/i)

    expect(state.workspaces).toHaveLength(0)
  })
})
