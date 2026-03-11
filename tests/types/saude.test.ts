// tests/types/saude.test.ts
import { describe, it, expect } from 'vitest'
import { isPRMunicipality, DENGUE_ALERT_CONFIG } from '@/types/saude'

describe('isPRMunicipality', () => {
  it('returns true for Curitiba IBGE code', () => {
    expect(isPRMunicipality('4106902')).toBe(true)
  })

  it('returns true for any code starting with 41', () => {
    expect(isPRMunicipality('4100000')).toBe(true)
    expect(isPRMunicipality('4199999')).toBe(true)
  })

  it('returns false for São Paulo code', () => {
    expect(isPRMunicipality('3550308')).toBe(false)
  })

  it('returns false for Rio de Janeiro code', () => {
    expect(isPRMunicipality('3304557')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPRMunicipality('')).toBe(false)
  })
})

describe('DENGUE_ALERT_CONFIG', () => {
  it('has 4 alert levels (0-3)', () => {
    expect(DENGUE_ALERT_CONFIG[0]).toBeDefined()
    expect(DENGUE_ALERT_CONFIG[1]).toBeDefined()
    expect(DENGUE_ALERT_CONFIG[2]).toBeDefined()
    expect(DENGUE_ALERT_CONFIG[3]).toBeDefined()
  })

  it('level 0 is green (no alert)', () => {
    expect(DENGUE_ALERT_CONFIG[0].color).toBe('#10b981')
    expect(DENGUE_ALERT_CONFIG[0].label).toBe('Verde')
  })

  it('level 3 is red (epidemic)', () => {
    expect(DENGUE_ALERT_CONFIG[3].color).toBe('#ef4444')
    expect(DENGUE_ALERT_CONFIG[3].label).toBe('Vermelho')
  })

  it('each level has color, label, description, textColor', () => {
    for (const config of Object.values(DENGUE_ALERT_CONFIG)) {
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('label')
      expect(config).toHaveProperty('description')
      expect(config).toHaveProperty('textColor')
    }
  })
})
