// tests/types/index.test.ts
//
// Modelo de planos do pivô DataGeo PR (commit 710dee0, 2026-08-06): tiers
// Starter e Pro na PricingPage, 'solo' mantido como alias legado de 'starter'
// para assinaturas antigas, e 'trial' como avaliação.
import { describe, it, expect } from 'vitest'
import { PLAN_FEATURES } from '@/types'

describe('PLAN_FEATURES', () => {
  it('tem trial, starter, solo (legado), pro e enterprise', () => {
    expect(Object.keys(PLAN_FEATURES)).toEqual(['trial', 'starter', 'solo', 'pro', 'enterprise'])
  })

  it('trial libera as camadas base, sem alertas push nem API', () => {
    const trial = PLAN_FEATURES.trial
    expect(trial.clima).toBe(true)
    expect(trial.noticias).toBe(true)
    expect(trial.agro).toBe(true)
    expect(trial.saude).toBe(true)
    expect(trial.ambiente).toBe(true)
    expect(trial.alertas_push).toBe(false)
    expect(trial.api_access).toBe(false)
  })

  it('starter: console nas camadas centrais, alertas e API, sem agro', () => {
    // PricingPage: "API REST com 1 chave", "Camadas: clima, queimadas, dengue,
    // água, IRTC", "Alertas por e-mail"; agro VBP só no Pro.
    const starter = PLAN_FEATURES.starter
    expect(starter.clima).toBe(true)
    expect(starter.noticias).toBe(true)
    expect(starter.saude).toBe(true)
    expect(starter.ambiente).toBe(true)
    expect(starter.alertas_push).toBe(true)
    expect(starter.api_access).toBe(true)
    expect(starter.agro).toBe(false)
  })

  it("'solo' legado tem exatamente as features do starter", () => {
    expect(PLAN_FEATURES.solo).toEqual(PLAN_FEATURES.starter)
  })

  it('pro libera tudo, inclusive agro', () => {
    const pro = PLAN_FEATURES.pro
    expect(Object.values(pro).every(Boolean)).toBe(true)
    expect(pro.agro).toBe(true)
  })

  it('enterprise tem as mesmas features do pro', () => {
    expect(PLAN_FEATURES.enterprise).toEqual(PLAN_FEATURES.pro)
  })

  it('só o pro/enterprise diferem do starter no agro', () => {
    const diff = (Object.keys(PLAN_FEATURES.pro) as Array<keyof typeof PLAN_FEATURES.pro>)
      .filter((k) => PLAN_FEATURES.pro[k] !== PLAN_FEATURES.starter[k])
    expect(diff).toEqual(['agro'])
  })
})
