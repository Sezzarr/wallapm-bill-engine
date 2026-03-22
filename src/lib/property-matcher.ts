import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchMethod = 'account_number' | 'address' | null

export interface MatchResult {
  property_id: string | null
  status: 'processed' | 'unmatched'
  method: MatchMethod
}

// Tokenize and normalize an address string for fuzzy comparison
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  )
}

// Jaccard similarity between two token sets
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  const intersection = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

const FUZZY_THRESHOLD = 0.5

/**
 * Attempts to match a bill to a property using two strategies:
 * 1. Exact account_number match — finds other bills with the same account_number
 *    that are already linked to a property and reuses that association.
 * 2. Fuzzy address match — compares a provided address hint against all of the
 *    user's property addresses using Jaccard token similarity.
 *
 * Updates the bill's property_id and status in-place, and appends a
 * bill_status_log entry regardless of outcome.
 */
export async function matchBillToProperty(
  supabase: SupabaseClient,
  billId: string,
  userId: string,
  options: { account_number?: string | null; address?: string | null },
): Promise<MatchResult> {
  const { account_number, address } = options
  let property_id: string | null = null
  let method: MatchMethod = null

  // Strategy 1: look for sibling bills with the same account_number that are
  // already linked to a property, and inherit that association.
  if (account_number) {
    const { data: siblings } = await supabase
      .from('bills')
      .select('property_id')
      .eq('user_id', userId)
      .eq('account_number', account_number)
      .not('property_id', 'is', null)
      .neq('id', billId)
      .limit(1)

    if (siblings && siblings.length > 0 && siblings[0].property_id) {
      property_id = siblings[0].property_id
      method = 'account_number'
    }
  }

  // Strategy 2: fuzzy-match the provided address against property addresses.
  if (!property_id && address) {
    const { data: properties } = await supabase
      .from('properties')
      .select('id, address')
      .eq('user_id', userId)

    if (properties && properties.length > 0) {
      const needle = tokenize(address)
      let bestScore = 0
      let bestId: string | null = null

      for (const prop of properties) {
        const score = jaccardSimilarity(needle, tokenize(prop.address))
        if (score > bestScore) {
          bestScore = score
          bestId = prop.id
        }
      }

      if (bestScore >= FUZZY_THRESHOLD && bestId) {
        property_id = bestId
        method = 'address'
      }
    }
  }

  const status: 'matched' | 'unmatched' = property_id ? 'matched' : 'unmatched'

  await supabase
    .from('bills')
    .update({ property_id, status })
    .eq('id', billId)
    .eq('user_id', userId)

  await supabase.from('bill_status_log').insert({
    bill_id: billId,
    status,
    note: property_id
      ? `Auto-matched to property via ${method}`
      : 'No matching property found',
  })

  if (property_id) {
    await supabase
      .from('bills')
      .update({ status: 'processed' })
      .eq('id', billId)
      .eq('user_id', userId)

    await supabase.from('bill_status_log').insert({
      bill_id: billId,
      status: 'processed',
      note: 'Bill processed after successful property match',
    })
  }

  return { property_id, status: property_id ? 'processed' : 'unmatched', method }
}
