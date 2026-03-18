// tests/types/mapa.test.ts
import { describe, it, expect } from 'vitest'
import { LAYER_CONFIGS } from '@/types/mapa'

describe('LAYER_CONFIGS', () => {
  it('has 8 map layers', () => {
    expect(LAYER_CONFIGS).toHaveLength(8)
  })

  it('includes reservatorios as pro plan layer', () => {
    const reservatorios = LAYER_CONFIGS.find(l => l.id === 'reservatorios')
    expect(reservatorios).toBeDefined()
    expect(reservatorios?.plan).toBe('pro')
  })

  it('includes clima as solo plan layer', () => {
    const clima = LAYER_CONFIGS.find(l => l.id === 'clima')
    expect(clima).toBeDefined()
    expect(clima?.plan).toBe('solo')
  })

  it('includes queimadas as pro plan layer', () => {
    const queimadas = LAYER_CONFIGS.find(l => l.id === 'queimadas')
    expect(queimadas).toBeDefined()
    expect(queimadas?.plan).toBe('pro')
  })

  it('each layer has id, label, color, plan, description', () => {
    for (const layer of LAYER_CONFIGS) {
      expect(layer).toHaveProperty('id')
      expect(layer).toHaveProperty('label')
      expect(layer).toHaveProperty('color')
      expect(layer).toHaveProperty('plan')
      expect(layer).toHaveProperty('description')
    }
  })

  it('plans are only solo or pro', () => {
    for (const layer of LAYER_CONFIGS) {
      expect(['solo', 'pro']).toContain(layer.plan)
    }
  })
})
