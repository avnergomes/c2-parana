// tests/components/ErrorBoundary.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Component that throws
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error message')
  return <div>Children rendered</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error from React's error boundary logging
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders error message when child throws', () => {
    render(
      <ErrorBoundary moduleName="TestModule">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Erro ao carregar TestModule/)).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('shows default module name when not provided', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Erro ao carregar módulo/)).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom fallback')).toBeInTheDocument()
  })

  it('has retry button', () => {
    render(
      <ErrorBoundary moduleName="Clima">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    // Error state should be shown
    expect(screen.getByText(/Erro ao carregar Clima/)).toBeInTheDocument()

    // Retry button exists
    const retryButton = screen.getByText('Tentar novamente')
    expect(retryButton).toBeInTheDocument()

    // Clicking retry resets hasError state
    fireEvent.click(retryButton)
    // Since shouldThrow is still true, it will error again immediately
    expect(screen.getByText(/Erro ao carregar Clima/)).toBeInTheDocument()
  })
})
