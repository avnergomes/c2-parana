// tests/types/clima.test.ts
import { describe, it, expect } from 'vitest'
import { getWindDirection, getWeatherCondition, SEVERITY_CONFIG, ESTACOES_PRINCIPAIS } from '@/types/clima'

describe('getWindDirection', () => {
  it('returns — for null', () => {
    expect(getWindDirection(null)).toBe('—')
  })

  it('returns N for 0 degrees', () => {
    expect(getWindDirection(0)).toBe('N')
  })

  it('returns NE for 45 degrees', () => {
    expect(getWindDirection(45)).toBe('NE')
  })

  it('returns L for 90 degrees', () => {
    expect(getWindDirection(90)).toBe('L')
  })

  it('returns SE for 135 degrees', () => {
    expect(getWindDirection(135)).toBe('SE')
  })

  it('returns S for 180 degrees', () => {
    expect(getWindDirection(180)).toBe('S')
  })

  it('returns SO for 225 degrees', () => {
    expect(getWindDirection(225)).toBe('SO')
  })

  it('returns O for 270 degrees', () => {
    expect(getWindDirection(270)).toBe('O')
  })

  it('returns NO for 315 degrees', () => {
    expect(getWindDirection(315)).toBe('NO')
  })

  it('wraps around for 360 degrees', () => {
    expect(getWindDirection(360)).toBe('N')
  })
})

describe('getWeatherCondition', () => {
  it('returns Chuva for precipitation > 2', () => {
    expect(getWeatherCondition(25, 80, 5)).toContain('Chuva')
  })

  it('returns Garoa for precipitation > 0 and <= 2', () => {
    expect(getWeatherCondition(20, 70, 1)).toContain('Garoa')
  })

  it('returns Nublado for humidity > 85', () => {
    expect(getWeatherCondition(20, 90, 0)).toContain('Nublado')
  })

  it('returns Parcialmente nublado for humidity > 60', () => {
    expect(getWeatherCondition(25, 70, 0)).toContain('Parcialmente nublado')
  })

  it('returns Ensolarado for low humidity and no precipitation', () => {
    expect(getWeatherCondition(30, 40, 0)).toContain('Ensolarado')
  })

  it('handles null values', () => {
    expect(getWeatherCondition(null, null, null)).toContain('Ensolarado')
  })
})

describe('SEVERITY_CONFIG', () => {
  it('has all 5 severity levels', () => {
    expect(Object.keys(SEVERITY_CONFIG)).toEqual(['critical', 'high', 'medium', 'low', 'info'])
  })

  it('each level has color, border, label, and badgeClass', () => {
    for (const config of Object.values(SEVERITY_CONFIG)) {
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('border')
      expect(config).toHaveProperty('label')
      expect(config).toHaveProperty('badgeClass')
    }
  })
})

describe('ESTACOES_PRINCIPAIS', () => {
  it('includes Curitiba as A807', () => {
    expect(ESTACOES_PRINCIPAIS['A807']).toBe('Curitiba')
  })

  it('has 6 stations', () => {
    expect(Object.keys(ESTACOES_PRINCIPAIS)).toHaveLength(6)
  })
})
