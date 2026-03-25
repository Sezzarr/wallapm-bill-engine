import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: billId } = await params

  // Verify the bill exists and belongs to this user before touching anything.
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .select('id')
    .eq('id', billId)
    .eq('user_id', user.id)
    .single()

  if (billError || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  // Delete status log entries first to satisfy the FK constraint.
  await supabase.from('bill_status_log').delete().eq('bill_id', billId)

  const { error: deleteError } = await supabase
    .from('bills')
    .delete()
    .eq('id', billId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
