// src/pages/MapPage.tsx — COP (Common Operating Picture)
import { Suspense } from 'react'
import { MapModule } from '@/components/map/MapContainer'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export function MapPage() {
  return (
    <div className="h-[calc(100vh-56px)] w-full relative">
      {/* COP Title Bar */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
        <div className="bg-card/80 backdrop-blur rounded-md px-4 py-1.5 border border-white/10">
          <span className="text-xs font-semibold text-accent-green tracking-wider uppercase">
            COP — Common Operating Picture
          </span>
        </div>
      </div>

      <Suspense fallback={<LoadingScreen />}>
        <MapModule />
      </Suspense>
    </div>
  )
}
