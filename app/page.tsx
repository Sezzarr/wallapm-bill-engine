import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  redirect('/dashboard')
}
