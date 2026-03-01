// src/pages/MapPage.tsx
import { Suspense } from 'react'
import { MapModule } from '@/components/map/MapContainer'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export function MapPage() {
  return (
    <div className="h-[calc(100vh-56px)] w-full">
      <Suspense fallback={<LoadingScreen />}>
        <MapModule />
      </Suspense>
    </div>
  )
}
