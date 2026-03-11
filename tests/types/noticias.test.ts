// tests/types/noticias.test.ts
import { describe, it, expect } from 'vitest'
import { SOURCE_CONFIG, URGENCY_CONFIG, URGENT_KEYWORDS, IMPORTANT_KEYWORDS } from '@/types/noticias'

describe('SOURCE_CONFIG', () => {
  it('has 6 news sources', () => {
    expect(Object.keys(SOURCE_CONFIG)).toHaveLength(6)
    expect(Object.keys(SOURCE_CONFIG)).toEqual(['gazeta', 'g1pr', 'aen', 'bandab', 'gnews', 'alep'])
  })

  it('each source has label, color, url', () => {
    for (const config of Object.values(SOURCE_CONFIG)) {
      expect(config).toHaveProperty('label')
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('url')
    }
  })
})

describe('URGENCY_CONFIG', () => {
  it('has 3 urgency levels', () => {
    expect(Object.keys(URGENCY_CONFIG)).toEqual(['urgent', 'important', 'normal'])
  })

  it('urgent has red color', () => {
    expect(URGENCY_CONFIG.urgent.color).toBe('#ef4444')
  })
})

describe('Keywords', () => {
  it('URGENT_KEYWORDS is non-empty array', () => {
    expect(URGENT_KEYWORDS.length).toBeGreaterThan(0)
    expect(URGENT_KEYWORDS).toContain('emergência')
    expect(URGENT_KEYWORDS).toContain('enchente')
  })

  it('IMPORTANT_KEYWORDS is non-empty array', () => {
    expect(IMPORTANT_KEYWORDS.length).toBeGreaterThan(0)
    expect(IMPORTANT_KEYWORDS).toContain('decreto')
    expect(IMPORTANT_KEYWORDS).toContain('temporal')
  })
})
