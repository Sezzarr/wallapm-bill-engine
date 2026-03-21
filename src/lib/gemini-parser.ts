import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedBill, ParseResult } from './edi-parser'

const EXTRACTION_PROMPT = `You are a utility bill data extractor. Analyze the provided bill document and extract the following fields as a JSON object:

- vendor: The name of the utility company or service provider (string or null)
- amount: The total amount due in dollars as a number (number or null)
- billing_period_start: The start date of the billing period in YYYY-MM-DD format (string or null)
- billing_period_end: The end date of the billing period in YYYY-MM-DD format (string or null)
- account_number: The customer account number (string or null)
- utility_type: One of "electric", "gas", "water", "telecom", "waste", or null if unclear

Return ONLY a valid JSON object with these exact keys. Do not include any explanation or markdown formatting.`

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

const VALID_UTILITY_TYPES = new Set(['electric', 'gas', 'water', 'telecom', 'waste'])

function normalizeExtracted(raw: Record<string, unknown>): Omit<ParsedBill, 'source' | 'raw_payload'> {
  const vendor = typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : null
  const amount = typeof raw.amount === 'number' && isFinite(raw.amount) ? raw.amount : null
  const billing_period_start = typeof raw.billing_period_start === 'string' && raw.billing_period_start ? raw.billing_period_start : null
  const billing_period_end = typeof raw.billing_period_end === 'string' && raw.billing_period_end ? raw.billing_period_end : null
  const account_number = typeof raw.account_number === 'string' && raw.account_number.trim() ? raw.account_number.trim() : null
  const utility_type = typeof raw.utility_type === 'string' && VALID_UTILITY_TYPES.has(raw.utility_type) ? raw.utility_type : null

  return {
    vendor,
    amount,
    billing_period_start,
    billing_period_end,
    account_number,
    utility_type,
    confidence_score: computeConfidence({ vendor, amount, billing_period_start, billing_period_end, account_number }),
  }
}

export async function parseWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY is not configured' }
  }

  try {
    const genai = new GoogleGenerativeAI(apiKey)
    const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType,
        },
      },
      EXTRACTION_PROMPT,
    ])

    const text = result.response.text().trim()

    // Strip markdown code fences if the model wrapped the JSON
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return { success: false, error: `Gemini returned non-JSON response: ${text.slice(0, 200)}` }
    }

    const extracted = normalizeExtracted(parsed)

    const bill: ParsedBill = {
      source: 'ocr',
      raw_payload: { gemini_response: parsed },
      ...extracted,
    }

    return { success: true, bill }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Gemini OCR error: ${message}` }
  }
}
