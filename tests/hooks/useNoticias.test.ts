// tests/hooks/useNoticias.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

function createChainableMock(finalData: unknown = null, finalError: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'order', 'limit', 'gte', 'single', 'maybeSingle']
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

import { useNoticias, useNoticiasStats } from '@/hooks/useNoticias'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useNoticias', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('returns news items', async () => {
    const mockNews = [
      { id: '1', source: 'gazeta', title: 'Notícia 1', urgency: 'normal', published_at: '2024-01-01' },
      { id: '2', source: 'g1pr', title: 'Notícia 2', urgency: 'urgent', published_at: '2024-01-02' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockNews))

    const { result } = renderHook(() => useNoticias(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('handles empty results', async () => {
    mockFrom.mockReturnValue(createChainableMock([]))

    const { result } = renderHook(() => useNoticias(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useNoticiasStats', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('calculates urgentes and total correctly', async () => {
    const mockUrgency = [
      { urgency: 'urgent' },
      { urgency: 'urgent' },
      { urgency: 'important' },
      { urgency: 'normal' },
      { urgency: 'normal' },
    ]

    mockFrom.mockReturnValue(createChainableMock(mockUrgency))

    const { result } = renderHook(() => useNoticiasStats(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.urgentes).toBe(2)
    expect(result.current.data?.importantes).toBe(1)
    expect(result.current.data?.total).toBe(5)
  })
})
