// src/hooks/useTrafego.ts
// Hooks para trafego aereo e maritimo: snapshot atual + janela horaria.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AviationTraffic, MaritimeTraffic } from '@/types/trafego'

const SNAPSHOT_WINDOW_MIN = 10
const HISTORY_WINDOW_HOURS = 1

function _isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString()
}

/** Snapshot mais recente: ultima leitura por icao24 nos ultimos 10min. */
export function useAviationTraffic() {
  return useQuery({
    queryKey: ['aviation-traffic-snapshot'],
    queryFn: async () => {
      const since = _isoMinutesAgo(SNAPSHOT_WINDOW_MIN)
      const { data, error } = (await supabase
        .from('aviation_traffic' as never)
        .select(
          'id, icao24, callsign, origin_country, latitude, longitude, baro_altitude_m, geo_altitude_m, velocity_ms, true_track, vertical_rate_ms, on_ground, squawk, category, source, observed_at'
        )
        .gte('observed_at', since)
        .order('observed_at', { ascending: false })
        .limit(2000)) as { data: AviationTraffic[] | null; error: unknown }

      if (error) throw error

      const seen = new Set<string>()
      const latest = (data || []).filter((row) => {
        if (seen.has(row.icao24)) return false
        seen.add(row.icao24)
        return true
      })
      return latest
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

/** Janela historica para timeline (ultima 1h, todas as posicoes). */
export function useAviationHistory(hours = HISTORY_WINDOW_HOURS) {
  return useQuery({
    queryKey: ['aviation-traffic-history', hours],
    queryFn: async () => {
      const since = _isoMinutesAgo(hours * 60)
      const { data, error } = (await supabase
        .from('aviation_traffic' as never)
        .select(
          'icao24, callsign, latitude, longitude, baro_altitude_m, on_ground, true_track, observed_at'
        )
        .gte('observed_at', since)
        .order('observed_at', { ascending: true })
        .limit(10000)) as { data: AviationTraffic[] | null; error: unknown }

      if (error) throw error
      return data || []
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  })
}

/** Snapshot maritimo: ultima leitura por mmsi nos ultimos 30min. */
export function useMaritimeTraffic() {
  return useQuery({
    queryKey: ['maritime-traffic-snapshot'],
    queryFn: async () => {
      const since = _isoMinutesAgo(30)
      const { data, error } = (await supabase
        .from('maritime_traffic' as never)
        .select(
          'id, mmsi, imo, vessel_name, callsign, ship_type, ship_type_label, latitude, longitude, sog_knots, cog_deg, heading_deg, nav_status, nav_status_label, destination, eta, draught_m, length_m, width_m, source, observed_at'
        )
        .gte('observed_at', since)
        .order('observed_at', { ascending: false })
        .limit(2000)) as { data: MaritimeTraffic[] | null; error: unknown }

      if (error) throw error

      const seen = new Set<number>()
      const latest = (data || []).filter((row) => {
        if (seen.has(row.mmsi)) return false
        seen.add(row.mmsi)
        return true
      })
      return latest
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 2,
  })
}

/** Estatisticas para o COP: contagens em janela rapida. */
export function useTrafegoStats() {
  const aviation = useAviationTraffic()
  const maritime = useMaritimeTraffic()

  const aircraftCount = aviation.data?.length ?? 0
  const aircraftAirborne = aviation.data?.filter((a) => !a.on_ground).length ?? 0
  const vesselCount = maritime.data?.length ?? 0

  // Navios em Paranagua (BBox restrito ao porto: -25.6 a -25.4 lat, -48.6 a -48.3 lon)
  const vesselsParanagua =
    maritime.data?.filter(
      (v) =>
        v.latitude >= -25.6 && v.latitude <= -25.4 && v.longitude >= -48.6 && v.longitude <= -48.3
    ).length ?? 0

  return {
    aircraftCount,
    aircraftAirborne,
    vesselCount,
    vesselsParanagua,
    isLoading: aviation.isLoading || maritime.isLoading,
  }
}
