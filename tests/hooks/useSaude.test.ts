// tests/hooks/useSaude.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

function createChainableMock(finalData: unknown = null, finalError: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'order', 'limit', 'gte', 'single', 'maybeSingle', 'lte', 'lt']
  for (const method of methods) {
    chain[method] = vi.fn(() => ({ ...chain, data: finalData, error: finalError }))
  }
  return chain
}

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn() },
  },
  callEdgeFunction: vi.fn(),
}))

import { useDengueAtual, useLeitosSUS } from '@/hooks/useSaude'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useDengueAtual', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns dengue data for latest week', async () => {
    const mockDengue = [
      { id: '1', ibge_code: '4106902', municipality_name: 'Curitiba', cases: 150, alert_level: 2 },
      { id: '2', ibge_code: '4113700', municipality_name: 'Londrina', cases: 80, alert_level: 1 },
    ]

    // First call returns latest week, second call returns data for that week
    mockFrom.mockReturnValue(createChainableMock(mockDengue))

    const { result } = renderHook(() => useDengueAtual(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('returns empty array when no latest week', async () => {
    mockFrom.mockReturnValue(createChainableMock(null))

    const { result } = renderHook(() => useDengueAtual(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useLeitosSUS', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns leitos data from cache', async () => {
    const mockLeitos = {
      data: {
        total_leitos: 30000,
        leitos_uti: 3500,
        ocupacao_uti_pct: 78.5,
        data_referencia: '2024-01-15',
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockLeitos))

    const { result } = renderHook(() => useLeitosSUS(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeTruthy()
  })

  it('returns null when cache has no nested data', async () => {
    mockFrom.mockReturnValue(createChainableMock({ data: null }))

    const { result } = renderHook(() => useLeitosSUS(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
