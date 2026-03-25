'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/src/lib/supabase'

type Bill = {
  id: string
  vendor: string | null
  amount: number | null
  billing_period_start: string | null
  billing_period_end: string | null
  account_number: string | null
  utility_type: string | null
  property_id: string | null
  status: string
  source: string | null
  raw_payload: Record<string, unknown> | null
  confidence_score: number | null
  created_at: string
}

type LogEntry = {
  id: string
  status: string
  note: string | null
  changed_at: string
}

type Property = { id: string; name: string; address: string }

const STATUS_CFG: Record<string, { label: string; badge: string; timeline: string }> = {
  pending:   { label: 'Pending',   badge: 'bg-amber-400/10 text-amber-400 ring-amber-400/20',   timeline: 'bg-amber-500' },
  matched:   { label: 'Matched',   badge: 'bg-blue-400/10 text-blue-400 ring-blue-400/20',     timeline: 'bg-blue-500' },
  processed: { label: 'Processed', badge: 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20', timeline: 'bg-emerald-500' },
  error:     { label: 'Error',     badge: 'bg-red-400/10 text-red-400 ring-red-400/20',         timeline: 'bg-red-500' },
  unmatched: { label: 'Unmatched', badge: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',     timeline: 'bg-zinc-600' },
}

function fmtUSD(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{label}</dt>
      <dd className={`text-sm text-zinc-300 ${mono ? 'font-mono text-xs text-zinc-400' : ''}`}>
        {value ?? <span className="text-zinc-700">—</span>}
      </dd>
    </div>
  )
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [bill, setBill] = useState<Bill | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [pickedProp, setPickedProp] = useState('')
  const [assignError, setAssignError] = useState('')

  const load = async () => {
    const [{ data: b }, { data: l }, { data: p }] = await Promise.all([
      supabase.from('bills').select('*').eq('id', id).single(),
      supabase.from('bill_status_log').select('*').eq('bill_id', id).order('changed_at', { ascending: true }),
      supabase.from('properties').select('id, name, address').order('name'),
    ])
    if (!b) { router.push('/dashboard'); return }
    setBill(b)
    setPickedProp(b.property_id ?? '')
    setLog(l ?? [])
    setProperties(p ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const assign = async (manual: boolean) => {
    if (!bill) return
    setAssigning(true)
    setAssignError('')
    try {
      const body = manual && pickedProp
        ? JSON.stringify({ property_id: pickedProp })
        : JSON.stringify({})

      const res = await fetch(`/api/bills/${id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const data = await res.json()
      if (!res.ok) {
        setAssignError(data.error ?? 'Assignment failed')
        return
      }
      setBill(data.bill)
      setPickedProp(data.bill.property_id ?? '')
      await load()
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
      </div>
    )
  }

  if (!bill) return null

  const statusCfg = STATUS_CFG[bill.status] ?? STATUS_CFG.pending
  const confidence = bill.confidence_score ?? 0
  const pct = Math.round(confidence * 100)
  const confColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const confText = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  const confMsg = pct >= 80
    ? 'High — all key fields extracted successfully.'
    : pct >= 50
    ? 'Medium — some fields may be missing or uncertain.'
    : 'Low — manual review recommended.'

  const assignedProp = bill.property_id ? properties.find(p => p.id === bill.property_id) : null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6 py-3.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Bills
          </Link>
          <svg className="h-4 w-4 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="min-w-0 truncate font-mono text-xs text-zinc-600">{bill.id}</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500 text-[10px] font-black text-white">W</div>
            <span className="text-sm font-semibold text-zinc-100">WallaPM</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Hero row ── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              {bill.vendor ?? 'Unknown Vendor'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusCfg.badge}`}>
                {statusCfg.label}
              </span>
              {bill.utility_type && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium capitalize text-zinc-400">
                  {bill.utility_type}
                </span>
              )}
              {bill.source && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
                  {bill.source}
                </span>
              )}
            </div>
          </div>
          <div className="w-full sm:w-auto rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-4 sm:text-right">
            <p className="text-3xl font-semibold tabular-nums text-zinc-100">{fmtUSD(bill.amount)}</p>
            <p className="mt-0.5 text-xs text-zinc-600">Total amount due</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column ── */}
          <div className="space-y-5 lg:col-span-2">

            {/* Bill fields */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">Bill Details</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <Field label="Vendor"        value={bill.vendor} />
                <Field label="Utility Type"  value={bill.utility_type
                  ? bill.utility_type.charAt(0).toUpperCase() + bill.utility_type.slice(1)
                  : null}
                />
                <Field label="Account No."   value={bill.account_number} mono />
                <Field label="Period Start"   value={fmtDate(bill.billing_period_start)} />
                <Field label="Period End"     value={fmtDate(bill.billing_period_end)} />
                <Field label="Source"         value={bill.source} />
                <Field label="Ingested"       value={fmtDateTime(bill.created_at)} />
                <Field label="Bill ID"        value={bill.id} mono />
              </dl>
            </section>

            {/* Confidence score */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Extraction Confidence</h2>
                <span className={`text-2xl font-semibold tabular-nums ${confText}`}>
                  {bill.confidence_score != null ? `${pct}%` : '—'}
                </span>
              </div>
              {bill.confidence_score != null && (
                <>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${confColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-5 gap-1 sm:gap-2">
                    {(['vendor', 'amount', 'period_start', 'period_end', 'account'] as const).map((field, i) => {
                      const weights = [0.25, 0.30, 0.20, 0.15, 0.10]
                      const labels = ['Vendor', 'Amount', 'Period start', 'Period end', 'Account']
                      const values = [bill.vendor, bill.amount, bill.billing_period_start, bill.billing_period_end, bill.account_number]
                      const present = values[i] != null
                      return (
                        <div key={field} className="flex flex-col items-center gap-1.5">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            present ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'
                          }`}>
                            {present ? '✓' : '·'}
                          </div>
                          <span className="text-center text-[10px] leading-tight text-zinc-600">{labels[i]}</span>
                          <span className="text-[10px] text-zinc-700">{Math.round(weights[i] * 100)}%</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs text-zinc-600">{confMsg}</p>
                </>
              )}
            </section>

            {/* Status timeline */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">Status Timeline</h2>
              {log.length === 0 ? (
                <p className="text-sm text-zinc-700">No events recorded.</p>
              ) : (
                <ol className="relative ml-1 border-l border-zinc-800">
                  {log.map((entry, i) => {
                    const cfg = STATUS_CFG[entry.status] ?? STATUS_CFG.pending
                    const isLast = i === log.length - 1
                    return (
                      <li key={entry.id} className="ml-5 pb-7 last:pb-0">
                        {/* Dot */}
                        <div className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-zinc-950 ${
                          isLast ? cfg.timeline : 'bg-zinc-800'
                        }`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                          <time className="text-xs text-zinc-600">{fmtDateTime(entry.changed_at)}</time>
                        </div>
                        {entry.note && (
                          <p className="mt-1 text-xs text-zinc-500">{entry.note}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>

          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">

            {/* Property assignment */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Property</h2>

              {assignedProp ? (
                <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-sm font-medium text-blue-300">{assignedProp.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{assignedProp.address}</p>
                </div>
              ) : (
                <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-3">
                  <p className="text-sm text-zinc-600">No property assigned</p>
                </div>
              )}

              <div className="space-y-2.5">
                <label className="block text-xs text-zinc-500">Assign manually</label>
                <select
                  value={pickedProp}
                  onChange={e => setPickedProp(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                >
                  <option value="">— Select property —</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => assign(true)}
                  disabled={!pickedProp || assigning}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {assigning ? 'Saving…' : 'Assign'}
                </button>

                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 border-t border-zinc-800" />
                  <span className="text-xs text-zinc-700">or</span>
                  <div className="flex-1 border-t border-zinc-800" />
                </div>

                <button
                  onClick={() => assign(false)}
                  disabled={assigning}
                  className="w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                >
                  Auto-match
                </button>

                {assignError && (
                  <p className="rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-400">{assignError}</p>
                )}
              </div>
            </section>

            {/* Meta card */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Metadata</h2>
              <dl className="space-y-3">
                {([
                  ['Source', bill.source],
                  ['Status', bill.status],
                  ['Confidence', bill.confidence_score != null ? `${pct}%` : null],
                  ['Account', bill.account_number],
                ] as const).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between">
                    <dt className="text-xs text-zinc-600">{label}</dt>
                    <dd className="font-mono text-xs text-zinc-400">{val ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>

          </div>
        </div>
      </main>
    </div>
  )
}
