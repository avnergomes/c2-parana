// tests/hooks/useClima.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// Create chainable mock
function createChainableMock(finalData: unknown = null, finalError: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'order', 'limit', 'single', 'gte', 'lt', 'maybeSingle', 'lte']

  for (const method of methods) {
    chain[method] = vi.fn(() => {
      const result = { ...chain, data: finalData, error: finalError }
      // Make it thenable for await
      result.then = undefined
      return result
    })
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

import { useEstacoesPR, useAlertasINMET } from '@/hooks/useClima'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useEstacoesPR', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns deduplicated stations', async () => {
    const mockStations = [
      { station_code: 'A807', station_name: 'Curitiba', temperature: 20, observed_at: '2024-01-02T10:00:00' },
      { station_code: 'A807', station_name: 'Curitiba', temperature: 19, observed_at: '2024-01-01T10:00:00' },
      { station_code: 'A834', station_name: 'Londrina', temperature: 25, observed_at: '2024-01-02T10:00:00' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockStations))

    const { result } = renderHook(() => useEstacoesPR(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should deduplicate: only 2 unique stations
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].station_code).toBe('A807')
    expect(result.current.data?.[1].station_code).toBe('A834')
  })

  it('handles empty data', async () => {
    mockFrom.mockReturnValue(createChainableMock([]))

    const { result } = renderHook(() => useEstacoesPR(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useAlertasINMET', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns active alerts', async () => {
    const mockAlerts = [
      { id: '1', source: 'inmet', severity: 'high', title: 'Chuva forte', is_active: true, starts_at: '2024-01-01' },
      { id: '2', source: 'inmet', severity: 'medium', title: 'Ventos', is_active: true, starts_at: '2024-01-02' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockAlerts))

    const { result } = renderHook(() => useAlertasINMET(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('throws on supabase error', async () => {
    mockFrom.mockReturnValue(createChainableMock(null, new Error('DB error')))

    const { result } = renderHook(() => useAlertasINMET(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
