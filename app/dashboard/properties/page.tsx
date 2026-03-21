'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/src/lib/supabase'
import AddPropertyModal from '@/app/components/AddPropertyModal'

type Property = {
  id: string
  name: string
  address: string
  created_at: string
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PropertiesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setEmail(user.email ?? '')

    const { data } = await supabase
      .from('properties')
      .select('*')
      .order('name')

    setProperties(data ?? [])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await supabase.from('properties').delete().eq('id', id)
    setProperties(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
  }

  const navLinks = [
    { href: '/dashboard', label: 'Bills' },
    { href: '/dashboard/properties', label: 'Properties' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-xs font-black text-white">
              W
            </div>
            <span className="font-semibold tracking-tight text-zinc-100">WallaPM</span>
          </div>

          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label }) => (
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

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Page heading ── */}
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Properties</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Manage locations for bill matching and grouping.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Property
          </button>
        </div>

        {/* ── Property list ── */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-20 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <p className="text-sm text-zinc-600">No properties yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300"
            >
              Add your first property
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {properties.map(prop => (
              <div
                key={prop.id}
                className="flex items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-5 py-4"
              >
                {/* Icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700/60 bg-zinc-800">
                  <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{prop.name}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{prop.address}</p>
                </div>

                {/* Date */}
                <p className="hidden shrink-0 text-xs text-zinc-600 sm:block">
                  Added {formatDate(prop.created_at)}
                </p>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(prop.id)}
                  disabled={deletingId === prop.id}
                  aria-label={`Delete ${prop.name}`}
                  className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                >
                  {deletingId === prop.id ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AddPropertyModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
