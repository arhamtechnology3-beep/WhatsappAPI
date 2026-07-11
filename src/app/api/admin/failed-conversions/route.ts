import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET(request: Request) {
  try {
    // 1) Verify that the user is an admin or owner
    const ctx = await requireRole('admin')
    const accountId = ctx.accountId

    const supabase = supabaseAdmin()

    // 2) Fetch all PAID_NOT_CONVERTED orders sorted by created_at ascending
    const { data: failedOrders, error } = await supabase
      .from('cashfree_orders')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'PAID_NOT_CONVERTED')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[failed-conversions] DB query error:', error)
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, failed_orders: failedOrders })
  } catch (err: any) {
    console.error('[failed-conversions] endpoint error:', err)
    return NextResponse.json(
      { error: err.message || 'Unauthorized or server error' },
      { status: err.status || 500 }
    )
  }
}
