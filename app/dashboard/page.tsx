'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/src/lib/supabase'
import UploadModal from '@/app/components/UploadModal'

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
  confidence_score: number | null
  created_at: string
}

type Property = {
  id: string
  name: string
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  pending:   { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-400/10 text-amber-400 ring-amber-400/20' },
  matched:   { label: 'Matched',   dot: 'bg-blue-400',    badge: 'bg-blue-400/10 text-blue-400 ring-blue-400/20' },
  processed: { label: 'Processed', dot: 'bg-emerald-400', badge: 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20' },
  error:     { label: 'Error',     dot: 'bg-red-400',     badge: 'bg-red-400/10 text-red-400 ring-red-400/20' },
  unmatched: { label: 'Unmatched', dot: 'bg-zinc-500',    badge: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20' },
}

function sourceLabel(source: string | null): { text: string; cls: string } {
  if (!source) return { text: 'Unknown', cls: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20' }
  if (source === 'ocr') return { text: 'OCR', cls: 'bg-violet-400/10 text-violet-400 ring-violet-400/20' }
  if (source.startsWith('edi')) return { text: 'EDI', cls: 'bg-indigo-400/10 text-indigo-400 ring-indigo-400/20' }
  return { text: source, cls: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20' }
}

const UTILITY_GLYPHS: Record<string, string> = {
  electric: 'E', gas: 'G', water: 'W', telecom: 'T', waste: 'R',
}

function formatUSD(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const FILTERS = ['all', 'pending', 'matched', 'processed', 'unmatched', 'error'] as const
type Filter = typeof FILTERS[number]

export default function DashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [bills, setBills] = useState<Bill[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setEmail(user.email ?? '')

    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('bills').select('*').order('created_at', { ascending: false }),
      supabase.from('properties').select('id, name').order('name'),
    ])
    setBills(b ?? [])
    setProperties(p ?? [])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filtered = filter === 'all' ? bills : bills.filter(b => b.status === filter)
  const propMap = Object.fromEntries(properties.map(p => [p.id, p.name]))

  const counts = {
    total: bills.length,
    pending: bills.filter(b => b.status === 'pending').length,
    matched: bills.filter(b => b.status === 'matched').length,
    processed: bills.filter(b => b.status === 'processed').length,
  }

  const handleDeleteBill = async (id: string) => {
    setDeletingId(id)
    const res = await fetch(`/api/bills/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setBills(prev => prev.filter(b => b.id !== id))
      setConfirmDeleteId(null)
    }
    setDeletingId(null)
  }

  const handleExport = () => {
    const url = filter === 'all'
      ? '/api/bills/export'
      : `/api/bills/export?status=${filter}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 sm:gap-6 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-xs font-black text-white">
              W
            </div>
            <span className="font-semibold tracking-tight text-zinc-100">WallaPM</span>
          </div>

          <nav className="flex items-center gap-1">
            {([
              { href: '/dashboard', label: 'Bills' },
              { href: '/dashboard/properties', label: 'Properties' },
            ] as const).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-zinc-600 sm:block">{email}</span>
            <button
              onClick={handleSignOut}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Page heading ── */}
        <div className="mb-7">
          <h1 className="text-xl font-semibold text-zinc-100">Bills</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Utility bill processing pipeline.</p>
        </div>

        {/* ── Stats ── */}
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Total Bills',  counts.total,     'text-zinc-100',   'bg-zinc-400'],
            ['Pending',      counts.pending,   'text-amber-400',  'bg-amber-400'],
            ['Matched',      counts.matched,   'text-blue-400',   'bg-blue-400'],
            ['Processed',    counts.processed, 'text-emerald-400','bg-emerald-400'],
          ] as const).map(([label, value, textCls, dotCls]) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                <p className="text-xs font-medium text-zinc-500">{label}</p>
              </div>
              <p className={`mt-2.5 text-3xl font-semibold tabular-nums ${textCls}`}>
                {loading ? <span className="text-zinc-800">—</span> : value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">

          {/* Filter pills — scrolls horizontally on mobile with a fade hint */}
          <div className="relative min-w-0 flex-1">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <nav className="flex w-max items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                {FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      filter === f
                        ? 'bg-zinc-700/80 text-zinc-100 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </nav>
            </div>
            {/* Fade gradient — only visible on mobile when pills overflow */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-gradient-to-l from-zinc-950 to-transparent sm:hidden" />
          </div>

          {/* Action buttons — right-aligned on mobile, inline on desktop */}
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 sm:px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload
            </button>
          </div>
        </div>

        {/* ── Bill list ── */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-20 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-zinc-600">No bills found.</p>
            <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">
              Upload your first bill
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(bill => {
              const status = STATUS_CONFIG[bill.status] ?? STATUS_CONFIG.pending
              const src = sourceLabel(bill.source)
              const glyph = bill.utility_type ? (UTILITY_GLYPHS[bill.utility_type] ?? '?') : '?'
              const propName = bill.property_id ? propMap[bill.property_id] : null

              return (
                <div
                  key={bill.id}
                  className="group flex items-stretch rounded-xl border border-zinc-800/60 bg-zinc-900/40 transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  {/* Clickable area → bill detail */}
                  <Link
                    href={`/dashboard/bills/${bill.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5"
                  >
                    {/* Utility glyph */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700/60 bg-zinc-800 text-xs font-bold text-zinc-400">
                      {glyph}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {bill.vendor ?? 'Unknown vendor'}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${status.badge}`}>
                          {status.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${src.cls}`}>
                          {src.text}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-600">
                        {bill.utility_type && <span className="capitalize">{bill.utility_type}</span>}
                        <span className="truncate">{propName ?? 'No property'}</span>
                        {bill.billing_period_start && (
                          <span className="hidden sm:inline shrink-0">{formatDate(bill.billing_period_start)} – {formatDate(bill.billing_period_end)}</span>
                        )}
                      </div>
                    </div>

                    {/* Amount + date */}
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-zinc-100">{formatUSD(bill.amount)}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">{formatDate(bill.created_at)}</p>
                    </div>

                    <svg className="h-4 w-4 shrink-0 text-zinc-700 transition group-hover:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>

                  {/* Delete control */}
                  <div className="flex shrink-0 items-center border-l border-zinc-800/60 px-2">
                    {confirmDeleteId === bill.id ? (
                      <div className="flex items-center gap-1 px-1">
                        <span className="hidden text-xs text-zinc-500 sm:block">Delete?</span>
                        <button
                          onClick={() => handleDeleteBill(bill.id)}
                          disabled={deletingId === bill.id}
                          className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {deletingId === bill.id ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                          ) : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === bill.id}
                          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-300 disabled:opacity-50"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(bill.id)}
                        aria-label={`Delete ${bill.vendor ?? 'bill'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showModal && (
        <UploadModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
