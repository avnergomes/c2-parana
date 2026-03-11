// tests/lib/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, timeAgo, getBadgeClass, slugify } from '@/lib/utils'

describe('formatDate', () => {
  it('formats Date objects in dd/MM/yyyy format', () => {
    // Use Date constructor to avoid timezone issues with string parsing
    expect(formatDate(new Date(2024, 0, 15))).toBe('15/01/2024')
  })

  it('returns a valid date format', () => {
    const result = formatDate('2024-06-20T12:00:00Z')
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })
})

describe('formatDateTime', () => {
  it('includes time in format', () => {
    const result = formatDateTime('2024-01-15T14:30:00')
    expect(result).toContain('15/01/2024')
    expect(result).toContain('14:30')
  })
})

describe('timeAgo', () => {
  it('returns a string with suffix', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    const result = timeAgo(recent)
    expect(result).toContain('há')
  })
})

describe('getBadgeClass', () => {
  it('returns badge-danger for danger', () => {
    expect(getBadgeClass('danger')).toBe('badge-danger')
  })

  it('returns badge-warning for warning', () => {
    expect(getBadgeClass('warning')).toBe('badge-warning')
  })

  it('returns badge-success for success', () => {
    expect(getBadgeClass('success')).toBe('badge-success')
  })

  it('returns badge-info for info', () => {
    expect(getBadgeClass('info')).toBe('badge-info')
  })
})

describe('slugify additional cases', () => {
  it('handles Portuguese accents', () => {
    expect(slugify('São José dos Pinhais')).toBe('sao-jose-dos-pinhais')
    expect(slugify('Foz do Iguaçu')).toBe('foz-do-iguacu')
    expect(slugify('Maringá')).toBe('maringa')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
    expect(slugify('-hello-')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})
