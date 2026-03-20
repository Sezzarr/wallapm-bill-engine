import { Readable } from 'node:stream'
import { X12parser } from 'x12-parser'

export interface ParsedBill {
  source: string
  vendor: string | null
  amount: number | null
  billing_period_start: string | null
  billing_period_end: string | null
  account_number: string | null
  utility_type: string | null
  raw_payload: Record<string, unknown>
  confidence_score: number | null
}

export type ParseResult =
  | { success: true; bill: ParsedBill }
  | { success: false; error: string }

// Segment object emitted by x12-parser: { name: string, '1': string, '2': string, ... }
type Segment = Record<string, string>

// Convert EDI date formats (YYYYMMDD or MMDDYY) to YYYY-MM-DD
function ediDateToISO(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (s.length === 8) {
    // YYYYMMDD
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  if (s.length === 6) {
    // MMDDYY — assume 2000s
    return `20${s.slice(4, 6)}-${s.slice(0, 2)}-${s.slice(2, 4)}`
  }
  return null
}

// Infer utility type from vendor name heuristics
function inferUtilityType(vendor: string | null): string | null {
  if (!vendor) return null
  const v = vendor.toLowerCase()
  if (/electric|power|energy|light/.test(v)) return 'electric'
  if (/gas|natural gas/.test(v)) return 'gas'
  if (/water|sewer/.test(v)) return 'water'
  if (/telecom|phone|fiber|internet|comcast|att|verizon|sprint|t-mobile/.test(v)) return 'telecom'
  if (/waste|trash|recycl/.test(v)) return 'waste'
  return null
}

// Parse all segments from an EDI string via a Node stream
function collectSegments(ediString: string): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    const segments: Segment[] = []
    const parser = new X12parser()

    parser.on('error', reject)
    parser.on('data', (seg: Segment) => segments.push(seg))
    parser.on('end', () => resolve(segments))

    const source = Readable.from([ediString])
    source.on('error', reject)
    source.pipe(parser)
  })
}

function extract835(segments: Segment[]): Omit<ParsedBill, 'source' | 'raw_payload'> {
  let vendor: string | null = null
  let amount: number | null = null
  let billing_period_start: string | null = null
  let billing_period_end: string | null = null
  let account_number: string | null = null

  for (const seg of segments) {
    switch (seg.name) {
      case 'BPR':
        // BPR02 = total payment amount
        if (seg['2']) amount = parseFloat(seg['2'])
        break

      case 'TRN':
        // TRN02 = trace/reference number — use as account_number fallback
        if (!account_number && seg['2']) account_number = seg['2']
        break

      case 'DTM':
        // 232 = claim statement period start, 233 = end
        if (seg['1'] === '232') billing_period_start = ediDateToISO(seg['2'])
        if (seg['1'] === '233') billing_period_end = ediDateToISO(seg['2'])
        break

      case 'N1':
        // PR = payer (vendor sending remittance), PE = payee
        if (seg['1'] === 'PR' && seg['2']) vendor = seg['2']
        break

      case 'REF':
        // 2U = payer identification, EV = receiver identification, often contains account
        if ((seg['1'] === '2U' || seg['1'] === 'EV' || seg['1'] === 'NF') && seg['2']) {
          account_number = seg['2']
        }
        break
    }
  }

  return {
    vendor,
    amount,
    billing_period_start,
    billing_period_end,
    account_number,
    utility_type: inferUtilityType(vendor),
    confidence_score: computeConfidence({ vendor, amount, billing_period_start, billing_period_end, account_number }),
  }
}

function extract810(segments: Segment[]): Omit<ParsedBill, 'source' | 'raw_payload'> {
  let vendor: string | null = null
  let amount: number | null = null
  let billing_period_start: string | null = null
  let billing_period_end: string | null = null
  let account_number: string | null = null

  for (const seg of segments) {
    switch (seg.name) {
      case 'BIG':
        // BIG01 = invoice date (use as billing_period_start if nothing else sets it)
        if (seg['1']) billing_period_start = ediDateToISO(seg['1'])
        break

      case 'DTM':
        // 003 = invoice date, 090 = contract period start, 091 = contract period end
        // 007 = effective date, 106 = billing period start
        if (seg['1'] === '090' || seg['1'] === '007' || seg['1'] === '106') {
          billing_period_start = ediDateToISO(seg['2'])
        }
        if (seg['1'] === '091') {
          billing_period_end = ediDateToISO(seg['2'])
        }
        break

      case 'REF':
        // 2I = standard carrier alpha code / account, IV = seller's invoice number
        // AN = account number, VN = vendor order number, CN = contract number
        if ((seg['1'] === 'AN' || seg['1'] === '2I' || seg['1'] === 'IV') && seg['2']) {
          account_number = seg['2']
        }
        break

      case 'N1':
        // SE = selling party (vendor), SU = supplier, VN = vendor
        if ((seg['1'] === 'SE' || seg['1'] === 'SU' || seg['1'] === 'VN') && seg['2']) {
          vendor = seg['2']
        }
        break

      case 'TDS':
        // TDS01 = total invoice amount in cents
        if (seg['1']) amount = parseInt(seg['1'], 10) / 100
        break
    }
  }

  return {
    vendor,
    amount,
    billing_period_start,
    billing_period_end,
    account_number,
    utility_type: inferUtilityType(vendor),
    confidence_score: computeConfidence({ vendor, amount, billing_period_start, billing_period_end, account_number }),
  }
}

function computeConfidence(fields: {
  vendor: string | null
  amount: number | null
  billing_period_start: string | null
  billing_period_end: string | null
  account_number: string | null
}): number {
  const weights = [
    [fields.vendor, 0.25],
    [fields.amount, 0.30],
    [fields.billing_period_start, 0.20],
    [fields.billing_period_end, 0.15],
    [fields.account_number, 0.10],
  ] as const

  const score = weights.reduce((sum, [val, weight]) => (val != null ? sum + weight : sum), 0)
  return Math.round(score * 1000) / 1000
}

export async function parseEdi(ediString: string): Promise<ParseResult> {
  try {
    const segments = await collectSegments(ediString)

    if (segments.length === 0) {
      return { success: false, error: 'No segments found in EDI input' }
    }

    // Identify transaction set type from ST01
    const st = segments.find((s) => s.name === 'ST')
    const txType = st?.['1']

    const raw_payload: Record<string, unknown> = { segments, transaction_set: txType }

    let extracted: Omit<ParsedBill, 'source' | 'raw_payload'>

    if (txType === '835') {
      extracted = extract835(segments)
    } else if (txType === '810') {
      extracted = extract810(segments)
    } else {
      return {
        success: false,
        error: `Unsupported transaction set type: ${txType ?? 'unknown'}. Expected 835 or 810.`,
      }
    }

    const bill: ParsedBill = {
      source: `edi-${txType}`,
      raw_payload,
      ...extracted,
    }

    return { success: true, bill }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `EDI parse error: ${message}` }
  }
}
