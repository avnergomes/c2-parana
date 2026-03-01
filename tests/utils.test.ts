// tests/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatNumber, formatCurrency, formatPercent, slugify, cn } from '@/lib/utils'

describe('formatNumber', () => {
  it('formats integer with pt-BR locale', () => {
    expect(formatNumber(1500)).toBe('1.500')
    expect(formatNumber(1000000)).toBe('1.000.000')
  })

  it('formats with specified decimals', () => {
    expect(formatNumber(1500.5, 2)).toBe('1.500,50')
  })
})

describe('formatCurrency', () => {
  it('formats BRL currency', () => {
    expect(formatCurrency(49)).toContain('49,00')
    expect(formatCurrency(149.99)).toContain('149,99')
  })

  it('formats USD currency', () => {
    const result = formatCurrency(100, 'USD')
    expect(result).toContain('100,00')
  })
})

describe('formatPercent', () => {
  it('formats positive percentage with plus sign', () => {
    expect(formatPercent(5.5)).toBe('+5.5%')
  })

  it('formats negative percentage', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%')
  })

  it('respects decimal places', () => {
    expect(formatPercent(5.567, 2)).toBe('+5.57%')
  })
})

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes accents', () => {
    expect(slugify('Sao Jose dos Pinhais')).toBe('sao-jose-dos-pinhais')
    expect(slugify('Curitiba')).toBe('curitiba')
  })

  it('replaces special characters with hyphens', () => {
    expect(slugify('test@email.com')).toBe('test-email-com')
  })
})

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'inactive')).toBe('base active')
  })

  it('merges Tailwind classes correctly', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6')
  })
})
