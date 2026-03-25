'use client'

import { useState, useCallback, useRef } from 'react'
import type { DragEvent, ChangeEvent } from 'react'

type Tab = 'edi' | 'ocr' | 'bulk'

type SingleState =
  | { phase: 'idle' }
  | { phase: 'dragging' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'success'; billId: string }
  | { phase: 'error'; message: string }

type BulkFileStatus = 'pending' | 'uploading' | 'done' | 'error'

type BulkFile = {
  id: string
  file: File
  status: BulkFileStatus
  endpoint: 'edi' | 'ocr'
  error?: string
}

const TABS: { value: Tab; label: string; sub: string }[] = [
  { value: 'edi',  label: 'EDI File',    sub: 'X12 835 / 810' },
  { value: 'ocr',  label: 'PDF / Image', sub: 'Gemini Flash OCR' },
  { value: 'bulk', label: 'Bulk Upload', sub: 'Mixed files' },
]

const EDI_REJECTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
])

const OCR_SUPPORTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
])

const OCR_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

function detectEndpoint(file: File): 'edi' | 'ocr' {
  if (OCR_SUPPORTED_TYPES.has(file.type)) return 'ocr'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return OCR_EXTENSIONS.has(ext) ? 'ocr' : 'edi'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  // ── Single-file state ────────────────────────────────────────────────────
  const [tab, setTab]     = useState<Tab>('edi')
  const [state, setState] = useState<SingleState>({ phase: 'idle' })
  const [file, setFile]   = useState<File | null>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  // ── Bulk state ───────────────────────────────────────────────────────────
  const [bulkFiles, setBulkFiles]   = useState<BulkFile[]>([])
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkDragging, setBulkDragging] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  // ── Single-file helpers ──────────────────────────────────────────────────
  const pickFile = (f: File) => { setFile(f); setState({ phase: 'idle' }) }

  const onDragOver  = (e: DragEvent) => { e.preventDefault(); setState({ phase: 'dragging' }) }
  const onDragLeave = () => setState(s => s.phase === 'dragging' ? { phase: 'idle' } : s)
  const onDrop      = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }
  const onInput     = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) pickFile(f) }

  const switchTab = (t: Tab) => {
    if (bulkRunning) return
    setTab(t)
    setFile(null)
    setState({ phase: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  const upload = useCallback(async () => {
    if (!file) return

    if (file.size === 0) {
      setState({ phase: 'error', message: 'The selected file is empty. Please choose a file with content.' })
      return
    }
    if (tab === 'edi' && EDI_REJECTED_TYPES.has(file.type)) {
      const ext = file.name.split('.').pop()?.toUpperCase() ?? file.type
      setState({ phase: 'error', message: `"${file.name}" is a ${ext} file, not an EDI file. Switch to the PDF / Image tab, or upload a plain text EDI file (.edi, .x12, .835, .810, .txt).` })
      return
    }
    if (tab === 'ocr' && file.type && !OCR_SUPPORTED_TYPES.has(file.type)) {
      setState({ phase: 'error', message: `"${file.name}" is not supported. Please upload a PDF, JPEG, PNG, WebP, or HEIC file.` })
      return
    }

    setState({ phase: 'uploading', progress: 20 })
    const body = new FormData()
    body.append('file', file)
    const endpoint = tab === 'edi' ? '/api/bills/upload-edi' : '/api/bills/upload-ocr'

    try {
      setState({ phase: 'uploading', progress: 55 })
      const res = await fetch(endpoint, { method: 'POST', body })
      setState({ phase: 'uploading', progress: 90 })

      let data: { error?: string; bill?: { id: string } } = {}
      try { data = await res.json() } catch { /* non-JSON body */ }

      if (!res.ok) {
        setState({ phase: 'error', message: data.error ?? `Upload failed (HTTP ${res.status})` })
        return
      }
      setState({ phase: 'success', billId: data.bill!.id })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Network error — please check your connection and try again.' })
    }
  }, [file, tab])

  // ── Bulk helpers ─────────────────────────────────────────────────────────
  const addBulkFiles = (incoming: FileList | File[]) => {
    const files = Array.from(incoming)
    setBulkFiles(prev => {
      const existing = new Set(prev.map(bf => `${bf.file.name}:${bf.file.size}`))
      const fresh = files
        .filter(f => !existing.has(`${f.name}:${f.size}`))
        .map(f => ({
          id: `${f.name}-${f.size}-${Math.random()}`,
          file: f,
          status: 'pending' as const,
          endpoint: detectEndpoint(f),
        }))
      return [...prev, ...fresh]
    })
  }

  const removeBulkFile = (id: string) => setBulkFiles(prev => prev.filter(f => f.id !== id))

  // Upload sequentially — continue even if individual files fail.
  const uploadBulk = useCallback(async () => {
    setBulkRunning(true)

    // Snapshot pending IDs at the moment the button is clicked.
    const pendingIds = bulkFiles
      .filter(f => f.status === 'pending')
      .map(f => f.id)

    for (const fileId of pendingIds) {
      // Mark as uploading via functional update so we always have latest state.
      setBulkFiles(prev => prev.map(f =>
        f.id === fileId && f.status === 'pending' ? { ...f, status: 'uploading' } : f
      ))

      // Read file details from the snapshot (the file object itself never changes).
      const bf = bulkFiles.find(f => f.id === fileId)
      if (!bf) continue

      const body = new FormData()
      body.append('file', bf.file)
      const endpoint = bf.endpoint === 'edi' ? '/api/bills/upload-edi' : '/api/bills/upload-ocr'

      try {
        const res = await fetch(endpoint, { method: 'POST', body })
        let data: { error?: string } = {}
        try { data = await res.json() } catch { /* non-JSON body */ }

        setBulkFiles(prev => prev.map(f =>
          f.id === fileId
            ? res.ok
              ? { ...f, status: 'done' }
              : { ...f, status: 'error', error: data.error ?? `HTTP ${res.status}` }
            : f
        ))
      } catch (err) {
        setBulkFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Network error' }
            : f
        ))
      }
    }

    setBulkRunning(false)
  }, [bulkFiles])

  // ── Derived ──────────────────────────────────────────────────────────────
  const accept = tab === 'edi'
    ? '.edi,.x12,.835,.810,.txt'
    : 'application/pdf,image/jpeg,image/png,image/webp,image/heic'

  const isDragging = state.phase === 'dragging'

  const bulkPendingCount = bulkFiles.filter(f => f.status === 'pending').length
  const bulkDone = bulkFiles.length > 0 && !bulkRunning &&
    bulkFiles.every(f => f.status === 'done' || f.status === 'error')
  const bulkSuccessCount = bulkFiles.filter(f => f.status === 'done').length
  const bulkErrorCount   = bulkFiles.filter(f => f.status === 'error').length

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/60"
        style={{ maxHeight: 'min(92vh, 700px)' }}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Upload Bill</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Add a new bill to the processing pipeline.</p>
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

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => switchTab(t.value)}
              disabled={bulkRunning}
              className={`relative flex flex-1 flex-col items-center gap-0.5 px-3 py-3 transition disabled:opacity-50 ${
                tab === t.value
                  ? 'border-b-2 border-indigo-500 bg-indigo-500/5 text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-[10px] opacity-60">{t.sub}</span>
              {/* File count badge on bulk tab */}
              {t.value === 'bulk' && bulkFiles.length > 0 && (
                <span className="absolute right-2 top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold leading-none text-white">
                  {bulkFiles.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ════════════════ SINGLE-FILE TABS (edi / ocr) ════════════════ */}
          {tab !== 'bulk' && (
            <>
              {state.phase === 'success' ? (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
                    <svg className="h-7 w-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-zinc-100">Uploaded successfully</p>
                  <p className="mt-1 text-sm text-zinc-500">Your bill has been queued for processing.</p>
                  <div className="mt-6 flex gap-2.5">
                    <button
                      onClick={onSuccess}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                    >
                      Back to dashboard
                    </button>
                    <button
                      onClick={() => { setFile(null); setState({ phase: 'idle' }) }}
                      className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
                    >
                      Upload another
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                    {tab === 'edi'
                      ? 'Upload an X12 EDI file. Both 835 (remittance) and 810 (invoice) transaction sets are supported.'
                      : 'Upload a PDF or image of a utility bill. Gemini Flash will extract vendor, amount, dates, and account info.'}
                  </p>

                  {/* Drop zone */}
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`relative cursor-pointer select-none rounded-xl border-2 border-dashed p-5 sm:p-7 text-center transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]'
                        : file
                        ? 'border-zinc-600 bg-zinc-800/50'
                        : 'border-zinc-700/80 hover:border-zinc-600 hover:bg-zinc-800/30'
                    }`}
                  >
                    <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onInput} />
                    {file ? (
                      <div>
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
                          <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="truncate px-4 text-sm font-medium text-zinc-200">{file.name}</p>
                        <p className="mt-1 text-xs text-zinc-600">{(file.size / 1024).toFixed(1)} KB · click to replace</p>
                      </div>
                    ) : (
                      <div>
                        <svg className="mx-auto mb-3 h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <p className="text-sm text-zinc-400">
                          <span className="font-medium text-indigo-400">Click to browse</span>{' '}or drag and drop
                        </p>
                        <p className="mt-1.5 text-xs text-zinc-600">
                          {tab === 'edi' ? 'EDI · X12 · 835 · 810 · TXT' : 'PDF · JPEG · PNG · WebP · HEIC'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  {state.phase === 'uploading' && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between">
                        <span className="text-xs text-zinc-500">Uploading…</span>
                        <span className="tabular-nums text-xs text-zinc-600">{state.progress}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-out"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {state.phase === 'error' && (
                    <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3.5 ring-1 ring-inset ring-red-500/20">
                      <div className="flex items-start gap-3">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium leading-snug text-red-300">{state.message}</p>
                      </div>
                      <button
                        onClick={() => { setFile(null); setState({ phase: 'idle' }); if (inputRef.current) inputRef.current.value = '' }}
                        className="mt-3 text-xs font-medium text-red-400 underline underline-offset-2 transition hover:text-red-300"
                      >
                        Try a different file
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-5 flex gap-2.5">
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={upload}
                      disabled={!file || state.phase === 'uploading'}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {state.phase === 'uploading' ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ════════════════ BULK TAB ════════════════ */}
          {tab === 'bulk' && (
            <>
              {/* Drop zone — hidden after a completed batch */}
              {!bulkDone && (
                <div
                  onDragOver={e => { e.preventDefault(); setBulkDragging(true) }}
                  onDragLeave={() => setBulkDragging(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setBulkDragging(false)
                    addBulkFiles(e.dataTransfer.files)
                  }}
                  onClick={() => !bulkRunning && bulkInputRef.current?.click()}
                  className={`select-none rounded-xl border-2 border-dashed p-5 text-center transition-all ${
                    bulkDragging
                      ? 'cursor-copy border-indigo-500 bg-indigo-500/5 scale-[1.01]'
                      : bulkRunning
                      ? 'cursor-not-allowed border-zinc-800 opacity-40'
                      : 'cursor-pointer border-zinc-700/80 hover:border-zinc-600 hover:bg-zinc-800/30'
                  }`}
                >
                  <input
                    ref={bulkInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={e => {
                      if (e.target.files) {
                        addBulkFiles(e.target.files)
                        e.target.value = ''
                      }
                    }}
                  />
                  <svg className="mx-auto mb-2.5 h-7 w-7 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm text-zinc-400">
                    <span className="font-medium text-indigo-400">Click to browse</span>{' '}or drag and drop
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    EDI, PDF, JPEG, PNG and more · select multiple files
                  </p>
                </div>
              )}

              {/* File list */}
              {bulkFiles.length > 0 && (
                <div className={`space-y-1.5 ${bulkDone ? '' : 'mt-3'}`}>
                  {bulkFiles.map(bf => (
                    <div
                      key={bf.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        bf.status === 'done'      ? 'border-emerald-500/20 bg-emerald-500/5' :
                        bf.status === 'error'     ? 'border-red-500/20 bg-red-500/5' :
                        bf.status === 'uploading' ? 'border-indigo-500/20 bg-indigo-500/5' :
                                                    'border-zinc-800 bg-zinc-800/40'
                      }`}
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {bf.status === 'done' && (
                          <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {bf.status === 'error' && (
                          <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {bf.status === 'uploading' && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
                        )}
                        {bf.status === 'pending' && (
                          <div className="h-4 w-4 rounded-full border-2 border-zinc-700" />
                        )}
                      </div>

                      {/* Name + size / error */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-200">{bf.file.name}</p>
                        {bf.status === 'error' && bf.error ? (
                          <p className="mt-0.5 truncate text-[11px] text-red-400">{bf.error}</p>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-zinc-600">{fmtSize(bf.file.size)}</p>
                        )}
                      </div>

                      {/* Endpoint badge */}
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        bf.endpoint === 'ocr'
                          ? 'bg-violet-400/10 text-violet-400'
                          : 'bg-indigo-400/10 text-indigo-400'
                      }`}>
                        {bf.endpoint === 'ocr' ? 'OCR' : 'EDI'}
                      </span>

                      {/* Remove button */}
                      {!bulkRunning && bf.status !== 'uploading' && (
                        <button
                          onClick={() => removeBulkFile(bf.id)}
                          aria-label="Remove file"
                          className="shrink-0 rounded p-0.5 text-zinc-700 transition hover:text-zinc-400"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Completion summary */}
              {bulkDone && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-800/40 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                    <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Upload complete</p>
                    <p className="text-xs">
                      {bulkSuccessCount > 0 && (
                        <span className="text-emerald-400">{bulkSuccessCount} succeeded</span>
                      )}
                      {bulkSuccessCount > 0 && bulkErrorCount > 0 && (
                        <span className="text-zinc-700"> · </span>
                      )}
                      {bulkErrorCount > 0 && (
                        <span className="text-red-400">{bulkErrorCount} failed</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-2.5">
                {bulkDone ? (
                  <>
                    <button
                      onClick={onSuccess}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                    >
                      Back to dashboard
                    </button>
                    <button
                      onClick={() => setBulkFiles([])}
                      className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
                    >
                      Upload more
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onClose}
                      disabled={bulkRunning}
                      className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={uploadBulk}
                      disabled={bulkRunning || bulkPendingCount === 0}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {bulkRunning
                        ? 'Uploading…'
                        : bulkFiles.length === 0
                        ? 'Upload'
                        : `Upload ${bulkPendingCount} file${bulkPendingCount !== 1 ? 's' : ''}`}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
