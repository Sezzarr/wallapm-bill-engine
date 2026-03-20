import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/src/lib/supabase'
import { parseEdi } from '@/src/lib/edi-parser'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let ediText: string
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Missing file field in form data' }, { status: 400 })
    }

    ediText = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file' }, { status: 400 })
  }

  const result = await parseEdi(ediText)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  const { bill: parsed } = result

  const { data: bill, error: insertError } = await supabase
    .from('bills')
    .insert({
      user_id: user.id,
      source: parsed.source,
      vendor: parsed.vendor,
      amount: parsed.amount,
      billing_period_start: parsed.billing_period_start,
      billing_period_end: parsed.billing_period_end,
      account_number: parsed.account_number,
      utility_type: parsed.utility_type,
      status: 'pending',
      raw_payload: parsed.raw_payload,
      confidence_score: parsed.confidence_score,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Failed to save bill', details: insertError.message }, { status: 500 })
  }

  const { error: logError } = await supabase
    .from('bill_status_log')
    .insert({
      bill_id: bill.id,
      status: 'pending',
      note: 'Bill created from EDI upload',
    })

  if (logError) {
    // Non-fatal: bill was saved, log entry failed. Return bill with a warning.
    return NextResponse.json({ bill, warning: 'Bill saved but status log entry failed' }, { status: 201 })
  }

  return NextResponse.json({ bill }, { status: 201 })
}
