// src/contexts/MapDataContext.tsx
import React, { createContext, useContext } from 'react'
import type { GeoJsonObject } from 'geojson'

interface MapDataContextType {
  municipiosGeoJSON: GeoJsonObject | null
}

const MapDataContext = createContext<MapDataContextType>({ municipiosGeoJSON: null })

export function MapDataProvider({
  geoJSON,
  children,
}: {
  geoJSON: GeoJsonObject | null
  children: React.ReactNode
}) {
  return (
    <MapDataContext.Provider value={{ municipiosGeoJSON: geoJSON }}>
      {children}
    </MapDataContext.Provider>
  )
}

export function useMapData() {
  return useContext(MapDataContext)
}
