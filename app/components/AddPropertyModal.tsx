'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'

type Phase = 'idle' | 'submitting' | 'success' | 'error'

export default function AddPropertyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPhase('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), address: address.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error ?? `Failed (${res.status})`)
        setPhase('error')
        return
      }
      setPhase('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
      setPhase('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Add Property</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Properties are used to group and match bills.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {phase === 'success' ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
                <svg className="h-7 w-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-semibold text-zinc-100">Property added</p>
              <p className="mt-1 text-sm text-zinc-500">It's now available for bill matching.</p>
              <div className="mt-6 flex gap-2.5">
                <button
                  onClick={onSuccess}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  Done
                </button>
                <button
                  onClick={() => { setName(''); setAddress(''); setPhase('idle') }}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
                >
                  Add another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-400" htmlFor="prop-name">
                  Property name
                </label>
                <input
                  id="prop-name"
                  type="text"
                  required
                  placeholder="e.g. Sunset Office Building"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-400" htmlFor="prop-address">
                  Address
                </label>
                <input
                  id="prop-address"
                  type="text"
                  required
                  placeholder="e.g. 123 Main St, San Francisco, CA 94105"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>

              {phase === 'error' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-900/40 bg-red-950/40 px-3.5 py-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={phase === 'submitting'}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {phase === 'submitting' ? 'Saving…' : 'Add property'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
