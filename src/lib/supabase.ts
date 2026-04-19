// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.PROD) {
    throw new Error(
      'Missing required Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in production.'
    )
  }
  console.warn('Missing Supabase env vars. Copy .env.example to .env.local and fill in.')
}

// No-op lock para evitar contention do navigator lock do gotrue-js v2.39+,
// que causava AbortError e travava getSession em alguns navegadores. Como o
// app roda em uma unica aba por usuario na pratica, serializacao cross-tab
// nao e necessaria.
const noOpLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: noOpLock,
    },
    global: {
      headers: {
        'Accept': 'application/json',
      },
    },
  }
)

// Helper para chamar Edge Functions
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw new Error(error.message || `Edge function ${functionName} failed`)
  }

  return data as T
}
