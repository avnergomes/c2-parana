// tests/types/index.test.ts
import { describe, it, expect } from 'vitest'
import { PLAN_FEATURES } from '@/types'

describe('PLAN_FEATURES', () => {
  it('has trial, solo, pro, enterprise plans', () => {
    expect(Object.keys(PLAN_FEATURES)).toEqual(['trial', 'solo', 'pro', 'enterprise'])
  })

  it('trial gives access to all base features', () => {
    const trial = PLAN_FEATURES.trial
    expect(trial.clima).toBe(true)
    expect(trial.noticias).toBe(true)
    expect(trial.agro).toBe(true)
    expect(trial.saude).toBe(true)
    expect(trial.ambiente).toBe(true)
    expect(trial.alertas_push).toBe(false)
    expect(trial.api_access).toBe(false)
  })

  it('solo plan restricts advanced features', () => {
    const solo = PLAN_FEATURES.solo
    expect(solo.clima).toBe(true)
    expect(solo.noticias).toBe(true)
    expect(solo.agro).toBe(false)
    expect(solo.saude).toBe(false)
    expect(solo.ambiente).toBe(false)
  })

  it('pro plan gives full access', () => {
    const pro = PLAN_FEATURES.pro
    expect(pro.clima).toBe(true)
    expect(pro.agro).toBe(true)
    expect(pro.saude).toBe(true)
    expect(pro.ambiente).toBe(true)
    expect(pro.alertas_push).toBe(true)
    expect(pro.api_access).toBe(true)
  })

  it('enterprise matches pro', () => {
    expect(PLAN_FEATURES.enterprise).toEqual(PLAN_FEATURES.pro)
  })
})
