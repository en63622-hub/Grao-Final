import { createClient } from '@supabase/supabase-js'

// Substitua pelas suas credenciais do projeto Supabase (Project Settings > API)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://SEU-PROJETO.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'SUA-ANON-KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
})
