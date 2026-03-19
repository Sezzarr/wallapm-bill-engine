import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/src/lib/supabase'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Bill Processing Engine
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {user.email}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total Bills', value: '—' },
            { label: 'Pending Review', value: '—' },
            { label: 'Properties', value: '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
              <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {value}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
