'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'

export async function signup(
  _prev: { error: string },
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}
