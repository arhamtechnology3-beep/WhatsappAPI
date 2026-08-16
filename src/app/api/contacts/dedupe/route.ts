import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { mergeDuplicateContactsForAccount } from '@/lib/contacts/merge-duplicates'

export async function POST() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const merged = await mergeDuplicateContactsForAccount(supabaseAdmin(), ctx.accountId)
    return NextResponse.json({ success: true, merged })
  } catch (err: unknown) {
    return toErrorResponse(err)
  }
}
