/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_PRECOS_API_URL: string
  // Tokens sensiveis (WAQI, NASA FIRMS) NAO devem ser expostos no frontend
  // Os ETLs usam esses tokens server-side via GitHub Actions secrets
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
