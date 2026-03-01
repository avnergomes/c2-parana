// tests/components/KpiCard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KpiCard } from '@/components/ui/KpiCard'

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Temperatura" value="25.3C" accentColor="blue" />)
    expect(screen.getByText('Temperatura')).toBeInTheDocument()
    expect(screen.getByText('25.3C')).toBeInTheDocument()
  })

  it('renders numeric value with pt-BR formatting', () => {
    render(<KpiCard label="Total" value={1500} accentColor="green" />)
    expect(screen.getByText('1.500')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    const { container } = render(
      <KpiCard label="Teste" value="-" accentColor="blue" loading={true} />
    )
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders subvalue when provided', () => {
    render(
      <KpiCard
        label="VBP"
        value="R$ 152 bi"
        subvalue="Ref. 2023"
        accentColor="green"
      />
    )
    expect(screen.getByText('Ref. 2023')).toBeInTheDocument()
  })

  it('renders positive trend with up arrow', () => {
    render(<KpiCard label="Crescimento" value="10%" trend={5.5} accentColor="green" />)
    expect(screen.getByText(/5\.5%/)).toBeInTheDocument()
  })

  it('renders negative trend with down arrow', () => {
    render(<KpiCard label="Queda" value="-5%" trend={-3.2} accentColor="red" />)
    expect(screen.getByText(/3\.2%/)).toBeInTheDocument()
  })

  it('applies correct accent color class', () => {
    const { container } = render(
      <KpiCard label="Alerta" value="5" accentColor="red" />
    )
    expect(container.querySelector('.border-l-status-danger')).toBeInTheDocument()
  })
})
