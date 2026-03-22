import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'
import { matchBillToProperty } from '@/src/lib/property-matcher'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: billId } = await params

  const { data: bill, error: billError } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .eq('user_id', user.id)
    .single()

  if (billError || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  let body: { property_id?: string; address?: string } = {}
  try {
    const text = await request.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.property_id !== undefined) {
    // Manual assignment — verify the property belongs to this user first.
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id, name')
      .eq('id', body.property_id)
      .eq('user_id', user.id)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('bills')
      .update({ property_id: body.property_id, status: 'matched' })
      .eq('id', billId)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update bill', details: updateError.message },
        { status: 500 },
      )
    }

    await supabase.from('bill_status_log').insert({
      bill_id: billId,
      status: 'matched',
      note: `Manually matched to property: ${property.name}`,
    })

    await supabase
      .from('bills')
      .update({ status: 'processed' })
      .eq('id', billId)
      .eq('user_id', user.id)

    await supabase.from('bill_status_log').insert({
      bill_id: billId,
      status: 'processed',
      note: 'Bill processed after successful property match',
    })
  } else {
    // Auto-match using account_number from the bill and optional address hint
    // from the request body.
    await matchBillToProperty(supabase, billId, user.id, {
      account_number: bill.account_number,
      address: body.address ?? null,
    })
  }

  const { data: updatedBill, error: fetchError } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !updatedBill) {
    return NextResponse.json({ error: 'Failed to retrieve updated bill' }, { status: 500 })
  }

  return NextResponse.json({ bill: updatedBill })
}
