// tests/hooks/useAmbiente.test.ts
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

import { useFireSpots, useFireTrend, useRiverLevels, useAirQuality } from '@/hooks/useAmbiente'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useFireSpots', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns fire spots data', async () => {
    const mockFires = [
      { id: '1', latitude: -25.4, longitude: -49.2, brightness: 320, acq_date: '2024-01-15', satellite: 'AQUA' },
      { id: '2', latitude: -25.5, longitude: -49.3, brightness: 310, acq_date: '2024-01-15', satellite: 'TERRA' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockFires))

    const { result } = renderHook(() => useFireSpots(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('throws on supabase error', async () => {
    mockFrom.mockReturnValue(createChainableMock(null, new Error('DB error')))

    const { result } = renderHook(() => useFireSpots(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('returns empty array when no data', async () => {
    mockFrom.mockReturnValue(createChainableMock(null, null))

    const { result } = renderHook(() => useFireSpots(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useFireTrend', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('groups fire spots by day', async () => {
    const mockData = [
      { acq_date: '2024-01-15' },
      { acq_date: '2024-01-15' },
      { acq_date: '2024-01-16' },
      { acq_date: '2024-01-16' },
      { acq_date: '2024-01-16' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockData))

    const { result } = renderHook(() => useFireTrend(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0]).toEqual({ date: '2024-01-15', count: 2 })
    expect(result.current.data?.[1]).toEqual({ date: '2024-01-16', count: 3 })
  })

  it('returns empty array when no data', async () => {
    mockFrom.mockReturnValue(createChainableMock(null))

    const { result } = renderHook(() => useFireTrend(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useRiverLevels', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('deduplicates by station_code', async () => {
    const mockRivers = [
      { id: '1', station_code: 'ST001', station_name: 'Rio Iguaçu A', level_cm: 150, observed_at: '2024-01-15T12:00:00' },
      { id: '2', station_code: 'ST001', station_name: 'Rio Iguaçu A', level_cm: 145, observed_at: '2024-01-15T06:00:00' },
      { id: '3', station_code: 'ST002', station_name: 'Rio Paraná B', level_cm: 200, observed_at: '2024-01-15T12:00:00' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockRivers))

    const { result } = renderHook(() => useRiverLevels(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Should deduplicate: 2 unique stations
    expect(result.current.data).toHaveLength(2)
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(createChainableMock(null, new Error('DB error')))

    const { result } = renderHook(() => useRiverLevels(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useAirQuality', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('deduplicates by city', async () => {
    const mockAir = [
      { id: '1', city: 'Curitiba', aqi: 45, observed_at: '2024-01-15T12:00:00' },
      { id: '2', city: 'Curitiba', aqi: 42, observed_at: '2024-01-15T06:00:00' },
      { id: '3', city: 'Londrina', aqi: 60, observed_at: '2024-01-15T12:00:00' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockAir))

    const { result } = renderHook(() => useAirQuality(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Should deduplicate: 2 unique cities
    expect(result.current.data).toHaveLength(2)
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(createChainableMock(null, new Error('DB error')))

    const { result } = renderHook(() => useAirQuality(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
