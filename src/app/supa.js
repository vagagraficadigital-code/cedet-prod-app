import { createClient } from '@supabase/supabase-js'
const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.error('Faltam variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY na Vercel.')
}

export const supa = createClient(url, anon)
