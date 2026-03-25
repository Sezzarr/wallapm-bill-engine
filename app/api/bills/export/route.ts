import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'

const VALID_STATUSES = new Set(['pending', 'matched', 'processed', 'error', 'unmatched'])

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  // Wrap in quotes if the value contains a comma, double-quote, or newline
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status')
  const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null

  // Fetch bills
  let query = supabase
    .from('bills')
    .select('vendor, amount, utility_type, account_number, billing_period_start, billing_period_end, status, property_id, source, confidence_score, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data: bills, error: billsError } = await query
  if (billsError) {
    return NextResponse.json({ error: billsError.message }, { status: 500 })
  }

  // Fetch properties for name lookup
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name')
    .eq('user_id', user.id)

  const propMap: Record<string, string> = Object.fromEntries(
    (properties ?? []).map(p => [p.id, p.name])
  )

  // Build CSV
  const header = csvRow([
    'vendor',
    'amount',
    'utility_type',
    'account_number',
    'billing_period_start',
    'billing_period_end',
    'status',
    'property_name',
    'source',
    'confidence_score',
    'created_at',
  ])

  const rows = (bills ?? []).map(bill =>
    csvRow([
      bill.vendor,
      bill.amount,
      bill.utility_type,
      bill.account_number,
      bill.billing_period_start,
      bill.billing_period_end,
      bill.status,
      bill.property_id ? (propMap[bill.property_id] ?? '') : '',
      bill.source,
      bill.confidence_score != null ? Math.round(bill.confidence_score * 100) / 100 : null,
      bill.created_at,
    ])
  )

  const csv = [header, ...rows].join('\r\n')

  const filename = status
    ? `bills-${status}-${new Date().toISOString().slice(0, 10)}.csv`
    : `bills-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
