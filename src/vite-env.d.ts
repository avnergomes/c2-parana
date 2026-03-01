/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
  readonly VITE_WAQI_TOKEN: string
  readonly VITE_NASA_FIRMS_KEY: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_PRECOS_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
