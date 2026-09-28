import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const projectId =
  supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/)?.[1] ?? ''
export const publicAnonKey = supabaseAnonKey
export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  projectId,
}
