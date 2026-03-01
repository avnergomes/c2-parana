// tests/setup.ts
import '@testing-library/jest-dom'

// Mock do import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    PROD: false,
    MODE: 'test',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-key',
  },
})
