import { beforeEach, describe, expect, it, vi } from 'vitest'

const createOwnedWorkspace = vi.hoisted(() => vi.fn())
const getUser = vi.hoisted(() => vi.fn())
const cookieSet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({ admin: true })),
}))

vi.mock('@/lib/workspaces/create-owned-workspace', () => ({
  createOwnedWorkspace,
}))

vi.mock('@/lib/billing/owner-subscription', () => ({
  OrganizationCapError: class OrganizationCapError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'OrganizationCapError'
    }
  },
  countOwnedOrganizations: vi.fn(),
  resolveOrBootstrapOwnerSubscription: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: cookieSet })),
}))

import { POST } from './route'
import { OrganizationCapError } from '@/lib/billing/owner-subscription'

describe('POST /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
  })

  it('creates a store org end-to-end for an authenticated user', async () => {
    createOwnedWorkspace.mockResolvedValue({
      workspace: {
        id: 'ws-pickle',
        name: 'Pickle Affair',
        slug: 'pickle-affair',
        role: 'owner',
      },
      subscription: {
        status: 'TRIALING',
        planId: 'growth',
        maxOrganizations: 3,
        ownedOrganizations: 2,
      },
    })

    const res = await POST(
      new Request('http://localhost/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pickle Affair' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workspace).toEqual({
      id: 'ws-pickle',
      name: 'Pickle Affair',
      slug: 'pickle-affair',
      role: 'owner',
    })
    expect(body.subscription.ownedOrganizations).toBe(2)
    expect(createOwnedWorkspace).toHaveBeenCalledWith(
      { admin: true },
      { ownerUserId: 'user-1', name: 'Pickle Affair' },
    )
    expect(cookieSet).toHaveBeenCalledWith(
      'wacrm_active_workspace_id',
      'ws-pickle',
      expect.any(Object),
    )
  })

  it('returns 403 when the plan cap blocks create', async () => {
    createOwnedWorkspace.mockRejectedValue(
      new OrganizationCapError('Your growth plan allows 3 store organization(s).'),
    )

    const res = await POST(
      new Request('http://localhost/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pickle Affair' }),
      }),
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/allows 3/),
    })
  })

  it('returns 401 when not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(
      new Request('http://localhost/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Pickle Affair' }),
      }),
    )

    expect(res.status).toBe(401)
    expect(createOwnedWorkspace).not.toHaveBeenCalled()
  })
})
