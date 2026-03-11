// tests/pages/AuthCallback.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockGetSession = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })),
    functions: { invoke: vi.fn() },
  },
  callEdgeFunction: vi.fn(),
}))

import { AuthCallbackPage } from '@/pages/AuthCallback'

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Autenticando...')).toBeInTheDocument()
  })

  it('navigates to dashboard on successful session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: '1', email: 'test@test.com' } } },
      error: null,
    })

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  it('navigates to login when no session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })
  })

  it('shows error on auth failure', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    })

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Erro na autenticação')).toBeInTheDocument()
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    })
  })
})
