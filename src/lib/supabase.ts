import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

let client: SupabaseClient<Database> | null = null

// Lazy singleton: không throw lúc import để demo mode chạy được khi thiếu env.
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error(
        'Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example thành .env.local và điền giá trị.',
      )
    }
    client = createClient<Database>(url, anonKey)
  }
  return client
}
