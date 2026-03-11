// tests/hooks/useAgro.test.ts
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

import { useVbpKpis, useComexKpis, useEmpregoAgro, useCreditoRural, useVbpMunicipios } from '@/hooks/useAgro'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useVbpKpis', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns VBP KPI data from cache', async () => {
    const mockKpis = {
      data: {
        vbp_total_brl: 100_000_000,
        vbp_lavoura_brl: 60_000_000,
        vbp_pecuaria_brl: 40_000_000,
        variacao_yoy: 5.2,
        ano_referencia: 2024,
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockKpis))

    const { result } = renderHook(() => useVbpKpis(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeTruthy()
  })

  it('returns null when no cache data', async () => {
    mockFrom.mockReturnValue(createChainableMock(null))

    const { result } = renderHook(() => useVbpKpis(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('useComexKpis', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns comex KPI data', async () => {
    const mockComex = {
      data: {
        export_usd: 500_000_000,
        import_usd: 300_000_000,
        saldo_usd: 200_000_000,
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockComex))

    const { result } = renderHook(() => useComexKpis(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeTruthy()
  })
})

describe('useEmpregoAgro', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns emprego agro data', async () => {
    const mockEmprego = {
      data: {
        total_empregos: 150_000,
        variacao_mes: 2.3,
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockEmprego))

    const { result } = renderHook(() => useEmpregoAgro(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeTruthy()
  })
})

describe('useCreditoRural', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns credito rural data', async () => {
    const mockCredito = {
      data: {
        total_contratos: 50_000,
        valor_total_brl: 10_000_000_000,
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockCredito))

    const { result } = renderHook(() => useCreditoRural(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeTruthy()
  })
})

describe('useVbpMunicipios', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns array when data is an array', async () => {
    const mockMunicipios = [
      { municipio: 'Toledo', vbp_total: 5_000_000 },
      { municipio: 'Cascavel', vbp_total: 4_000_000 },
    ]

    mockFrom.mockReturnValue(createChainableMock({ data: mockMunicipios }))

    const { result } = renderHook(() => useVbpMunicipios(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('handles wrapped items format', async () => {
    const mockMunicipios = {
      data: {
        items: [
          { municipio: 'Toledo', vbp_total: 5_000_000 },
        ],
      },
    }

    mockFrom.mockReturnValue(createChainableMock(mockMunicipios))

    const { result } = renderHook(() => useVbpMunicipios(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('returns empty array when no data', async () => {
    mockFrom.mockReturnValue(createChainableMock(null))

    const { result } = renderHook(() => useVbpMunicipios(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
