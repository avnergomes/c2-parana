// tests/types/trafego.test.ts
import { describe, it, expect } from 'vitest'
import {
  aviationCategory,
  vesselGroup,
  speedKmh,
  altitudeFt,
  altitudeFL,
  AVIATION_COLORS,
  VESSEL_COLORS,
  VESSEL_LABELS,
  interpolatePosition,
} from '@/types/trafego'

describe('aviationCategory', () => {
  it('returns on_ground when on_ground is true', () => {
    expect(aviationCategory(0, true)).toBe('on_ground')
    expect(aviationCategory(8000, true)).toBe('on_ground')
  })

  it('classifies altitude bands when airborne', () => {
    expect(aviationCategory(500, false)).toBe('low')
    expect(aviationCategory(3000, false)).toBe('medium')
    expect(aviationCategory(7000, false)).toBe('high')
    expect(aviationCategory(11000, false)).toBe('cruise')
  })

  it('returns medium when altitude is null and airborne', () => {
    expect(aviationCategory(null, false)).toBe('medium')
  })
})

describe('vesselGroup', () => {
  it('classifies cargo, tanker, passenger', () => {
    expect(vesselGroup(70)).toBe('cargo')
    expect(vesselGroup(79)).toBe('cargo')
    expect(vesselGroup(80)).toBe('tanker')
    expect(vesselGroup(89)).toBe('tanker')
    expect(vesselGroup(60)).toBe('passenger')
    expect(vesselGroup(69)).toBe('passenger')
  })

  it('classifies fishing, tug, pleasure', () => {
    expect(vesselGroup(30)).toBe('fishing')
    expect(vesselGroup(52)).toBe('tug')
    expect(vesselGroup(36)).toBe('pleasure')
    expect(vesselGroup(37)).toBe('pleasure')
  })

  it('falls back to other for unknown or null', () => {
    expect(vesselGroup(null)).toBe('other')
    expect(vesselGroup(0)).toBe('other')
    expect(vesselGroup(99)).toBe('other')
  })
})

describe('speedKmh', () => {
  it('converts m/s to km/h with rounding', () => {
    expect(speedKmh(10)).toBe('36 km/h')
    expect(speedKmh(100)).toBe('360 km/h')
  })

  it('handles null', () => {
    expect(speedKmh(null)).toBe('—')
  })
})

describe('altitudeFt', () => {
  it('converts meters to feet', () => {
    expect(altitudeFt(1000)).toBe('3281 ft')
    expect(altitudeFt(0)).toBe('0 ft')
  })

  it('handles null', () => {
    expect(altitudeFt(null)).toBe('—')
  })
})

describe('altitudeFL', () => {
  it('formats flight level above 500 ft', () => {
    expect(altitudeFL(10000)).toBe('FL328')
    expect(altitudeFL(5000)).toBe('FL164')
  })

  it('returns null for low altitude or null input', () => {
    expect(altitudeFL(null)).toBeNull()
    expect(altitudeFL(100)).toBeNull()
  })
})

describe('interpolatePosition', () => {
  const baseLat = -25.0
  const baseLon = -50.0
  const observed = '2026-04-27T22:00:00Z'
  const observedMs = new Date(observed).getTime()

  it('returns base position when elapsed time is zero', () => {
    const [lat, lon] = interpolatePosition(baseLat, baseLon, 200, 0, observed, observedMs)
    expect(lat).toBeCloseTo(baseLat, 6)
    expect(lon).toBeCloseTo(baseLon, 6)
  })

  it('returns base position when velocity is null', () => {
    const [lat, lon] = interpolatePosition(baseLat, baseLon, null, 90, observed, observedMs + 60_000)
    expect(lat).toBe(baseLat)
    expect(lon).toBe(baseLon)
  })

  it('returns base position when track is null', () => {
    const [lat, lon] = interpolatePosition(baseLat, baseLon, 200, null, observed, observedMs + 60_000)
    expect(lat).toBe(baseLat)
    expect(lon).toBe(baseLon)
  })

  it('moves north when bearing is 0 (lat increases)', () => {
    // 100 m/s north for 60s = 6000m = ~0.054 deg lat
    const [lat, lon] = interpolatePosition(baseLat, baseLon, 100, 0, observed, observedMs + 60_000)
    expect(lat).toBeGreaterThan(baseLat)
    expect(lon).toBeCloseTo(baseLon, 6)
  })

  it('moves east when bearing is 90 (lon increases)', () => {
    const [lat, lon] = interpolatePosition(baseLat, baseLon, 100, 90, observed, observedMs + 60_000)
    expect(lat).toBeCloseTo(baseLat, 6)
    expect(lon).toBeGreaterThan(baseLon)
  })

  it('caps extrapolation at 20min to avoid wild estimates', () => {
    const [lat20min] = interpolatePosition(baseLat, baseLon, 100, 0, observed, observedMs + 1_200_000)
    const [lat60min] = interpolatePosition(baseLat, baseLon, 100, 0, observed, observedMs + 3_600_000)
    expect(lat60min).toBeCloseTo(lat20min, 6)
  })

  it('returns base position when observation is in the future', () => {
    const [lat, lon] = interpolatePosition(baseLat, baseLon, 100, 90, observed, observedMs - 10_000)
    expect(lat).toBe(baseLat)
    expect(lon).toBe(baseLon)
  })
})

describe('color and label maps', () => {
  it('AVIATION_COLORS has all 5 categories', () => {
    expect(Object.keys(AVIATION_COLORS)).toHaveLength(5)
  })

  it('VESSEL_COLORS and VESSEL_LABELS share keys', () => {
    expect(Object.keys(VESSEL_COLORS).sort()).toEqual(Object.keys(VESSEL_LABELS).sort())
  })
})
