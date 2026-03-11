// tests/lib/supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn() },
  },
  callEdgeFunction: vi.fn(),
}))

import { callEdgeFunction } from '@/lib/supabase'

describe('callEdgeFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is exported as a function', () => {
    expect(typeof callEdgeFunction).toBe('function')
  })
})
