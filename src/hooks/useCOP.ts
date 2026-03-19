// src/hooks/useCOP.ts
import { useMemo } from 'react'
import { useIRTC } from './useIRTC'
import { useAlertasINMET } from './useClima'
import { useEstacoesPR } from './useClima'

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

/**
 * Aggregates data from all hooks to provide a unified COP (Common Operating Picture) view.
 * In a real implementation, you would aggregate actual data from the hooks.
 * This is a placeholder that structures the expected data format.
 */
export function useCOP(): COPData {
  const irtc = useIRTC()
  const inmet = useAlertasINMET()
  const estacoes = useEstacoesPR()

  // Process and aggregate data
  const processedData = useMemo(() => {
    const now = new Date().toISOString()

    // IRTC data
    const irtcSummary = {
      data: irtc.data,
      isLoading: irtc.isLoading,
    }

    // INMET alerts
    const inmetAlerts = {
      data: inmet.data || [],
      isLoading: inmet.isLoading,
    }

    // Fires data (placeholder - would come from a useQueimadas hook)
    const firesFires24h: FiresData = {
      total: 0,
      trend: 'stable',
    }

    // Dengue data (placeholder - would come from a useDengue hook)
    const dengueAlertMunicipalities: DengueData = {
      count: 0,
      trend: 'stable',
    }

    // Rivers data (placeholder - would come from a useRios hook)
    const riversAlert: RiversData = {
      count: 0,
    }

    // Weather stations
    const weatherStations = {
      data: estacoes.data || [],
      isLoading: estacoes.isLoading,
    }

    // Air quality (placeholder - would process from climate data)
    const worstAirQuality: AirQualityData | null = estacoes.data
      ? {
          aqi: 75, // placeholder
          city: 'Curitiba',
        }
      : null

    // Extreme temperature
    const extremeTemperature: TemperatureData | null = estacoes.data
      ? {
          max: 32.5,
          station: 'Curitiba',
        }
      : null

    return {
      irtcSummary,
      inmetAlerts,
      firesFires24h,
      dengueAlertMunicipalities,
      riversAlert,
      weatherStations,
      worstAirQuality,
      extremeTemperature,
      lastUpdate: now,
    }
  }, [irtc, inmet, estacoes])

  return processedData
}
