'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/src/lib/supabase'

export async function login(
  _prev: { error: string },
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect('/')
}
