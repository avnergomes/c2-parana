// tests/types/ambiente.test.ts
import { describe, it, expect } from 'vitest'
import { getAqiCategory, AQI_CONFIG, RIVER_ALERT_CONFIG, CIDADES_AR } from '@/types/ambiente'

describe('getAqiCategory', () => {
  it('returns good for AQI 0-50', () => {
    expect(getAqiCategory(0)).toBe('good')
    expect(getAqiCategory(25)).toBe('good')
    expect(getAqiCategory(50)).toBe('good')
  })

  it('returns moderate for AQI 51-100', () => {
    expect(getAqiCategory(51)).toBe('moderate')
    expect(getAqiCategory(100)).toBe('moderate')
  })

  it('returns unhealthy_sensitive for AQI 101-150', () => {
    expect(getAqiCategory(101)).toBe('unhealthy_sensitive')
    expect(getAqiCategory(150)).toBe('unhealthy_sensitive')
  })

  it('returns unhealthy for AQI 151-200', () => {
    expect(getAqiCategory(151)).toBe('unhealthy')
    expect(getAqiCategory(200)).toBe('unhealthy')
  })

  it('returns very_unhealthy for AQI 201-300', () => {
    expect(getAqiCategory(201)).toBe('very_unhealthy')
    expect(getAqiCategory(300)).toBe('very_unhealthy')
  })

  it('returns hazardous for AQI > 300', () => {
    expect(getAqiCategory(301)).toBe('hazardous')
    expect(getAqiCategory(500)).toBe('hazardous')
  })
})

describe('AQI_CONFIG', () => {
  it('has 6 categories', () => {
    expect(Object.keys(AQI_CONFIG)).toHaveLength(6)
  })

  it('each category has range, color, label, description', () => {
    for (const config of Object.values(AQI_CONFIG)) {
      expect(config).toHaveProperty('range')
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('label')
      expect(config).toHaveProperty('description')
      expect(config.range).toHaveLength(2)
    }
  })
})

describe('RIVER_ALERT_CONFIG', () => {
  it('has 4 alert levels', () => {
    expect(Object.keys(RIVER_ALERT_CONFIG)).toEqual(['normal', 'attention', 'alert', 'emergency'])
  })
})

describe('CIDADES_AR', () => {
  it('includes 4 cities for air quality monitoring', () => {
    expect(CIDADES_AR).toHaveLength(4)
    expect(CIDADES_AR.map(c => c.id)).toContain('curitiba')
    expect(CIDADES_AR.map(c => c.id)).toContain('londrina')
  })
})
