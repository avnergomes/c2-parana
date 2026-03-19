// src/hooks/useCOP.ts
import { useMemo } from 'react'
import { useIRTC } from './useIRTC'
import { useAlertasINMET, useEstacoesPR } from './useClima'
import { useFireSpots, useRiverLevels, useAirQuality } from './useAmbiente'
import { useDengueAtual } from './useSaude'

interface FiresData {
  total: number
  trend: 'up' | 'down' | 'stable'
}

interface DengueData {
  count: number
  trend: 'up' | 'down' | 'stable'
}

interface RiversData {
  count: number
}

interface AirQualityData {
  aqi: number
  city: string
}

interface TemperatureData {
  max: number
  station: string
}

export interface COPData {
  irtcSummary: {
    data: Map<string, any> | null
    isLoading: boolean
  }
  inmetAlerts: {
    data: any[] | null
    isLoading: boolean
  }
  firesFires24h: FiresData | null
  dengueAlertMunicipalities: DengueData | null
  riversAlert: RiversData | null
  weatherStations: {
    data: any[] | null
    isLoading: boolean
  }
  worstAirQuality: AirQualityData | null
  extremeTemperature: TemperatureData | null
  lastUpdate: string | null
}

export function useCOP(): COPData {
  const irtc = useIRTC()
  const inmet = useAlertasINMET()
  const estacoes = useEstacoesPR()
  const fireSpots = useFireSpots(1)
  const rivers = useRiverLevels()
  const airQuality = useAirQuality()
  const dengue = useDengueAtual()

  return useMemo(() => {
    const now = new Date().toISOString()

    // Fires: count spots from last 24h
    const firesTotalRaw = fireSpots.data?.length ?? 0
    const firesFires24h: FiresData = {
      total: firesTotalRaw,
      trend: firesTotalRaw > 50 ? 'up' : firesTotalRaw > 0 ? 'stable' : 'down',
    }

    // Dengue: count municipalities with alert_level >= 2
    const dengueAlertCount = dengue.data?.filter(
      (d: any) => (d.alert_level ?? 0) >= 2
    ).length ?? 0
    const dengueAlertMunicipalities: DengueData = {
      count: dengueAlertCount,
      trend: dengueAlertCount > 10 ? 'up' : dengueAlertCount > 0 ? 'stable' : 'down',
    }

    // Rivers: count stations not at 'normal'
    const riversAlertCount = rivers.data?.filter(
      (r: any) => r.alert_level && r.alert_level !== 'normal'
    ).length ?? 0
    const riversAlert: RiversData = { count: riversAlertCount }

    // Air quality: find worst AQI
    const worstAir = airQuality.data?.reduce<AirQualityData | null>((worst, station: any) => {
      const aqi = station.aqi ?? 0
      if (!worst || aqi > worst.aqi) {
        return { aqi, city: station.city || station.station_name || '?' }
      }
      return worst
    }, null) ?? null

    // Temperature: find max from weather stations
    const extremeTemp = estacoes.data?.reduce<TemperatureData | null>((max, s: any) => {
      const temp = s.temperature ?? s.temp_max ?? null
      if (temp != null && (!max || temp > max.max)) {
        return { max: temp, station: s.station_name || s.city || '?' }
      }
      return max
    }, null) ?? null

    return {
      irtcSummary: { data: irtc.data, isLoading: irtc.isLoading },
      inmetAlerts: { data: inmet.data || [], isLoading: inmet.isLoading },
      firesFires24h,
      dengueAlertMunicipalities,
      riversAlert,
      weatherStations: { data: estacoes.data || [], isLoading: estacoes.isLoading },
      worstAirQuality: worstAir,
      extremeTemperature: extremeTemp,
      lastUpdate: now,
    }
  }, [irtc, inmet, estacoes, fireSpots.data, rivers.data, airQuality.data, dengue.data])
}
