import React, { useMemo } from 'react'
import { Play, Pause } from 'lucide-react'

interface TimelineSliderProps {
  /** Current selected time (ISO string) */
  value: string
  /** Callback when time changes */
  onChange: (isoTime: string) => void
  /** Whether the timeline is playing (auto-advancing) */
  isPlaying: boolean
  /** Toggle play/pause */
  onTogglePlay: () => void
}

interface TickMark {
  position: number
  label: string
  isoTime: string
}

export function TimelineSlider({
  value,
  onChange,
  isPlaying,
  onTogglePlay,
}: TimelineSliderProps) {
  // Calculate 48 hours ago and now
  const now = useMemo(() => new Date(), [])
  const fortyEightHoursAgo = useMemo(
    () => new Date(now.getTime() - 48 * 60 * 60 * 1000),
    [now]
  )

  // Convert current value to slider position (0-2880 minutes)
  const currentTime = new Date(value)
  const sliderPosition = useMemo(() => {
    const diffMs = currentTime.getTime() - fortyEightHoursAgo.getTime()
    const diffMinutes = Math.max(0, Math.min(2880, diffMs / 60000))
    return diffMinutes
  }, [currentTime, fortyEightHoursAgo])

  // Check if at live position
  const isLive = useMemo(() => {
    const diffMs = Math.abs(now.getTime() - currentTime.getTime())
    return diffMs < 60000 // Within 1 minute
  }, [now, currentTime])

  // Generate tick marks every 6 hours
  const tickMarks = useMemo(() => {
    const ticks: TickMark[] = []
    const sixHoursMs = 6 * 60 * 60 * 1000

    for (let i = 0; i <= 8; i++) {
      const tickTime = new Date(fortyEightHoursAgo.getTime() + i * sixHoursMs)
      const position = (i * 6 * 60) / 2880 // Convert to percentage (0-100)

      // Format label as HH:mm
      const hours = String(tickTime.getHours()).padStart(2, '0')
      const minutes = String(tickTime.getMinutes()).padStart(2, '0')

      ticks.push({
        position,
        label: `${hours}:${minutes}`,
        isoTime: tickTime.toISOString(),
      })
    }

    return ticks
  }, [fortyEightHoursAgo])

  // Format current selected time as "DD/MM HH:mm" (BRT)
  const formattedTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    })

    return formatter.format(currentTime)
  }, [currentTime])

  // Get relative time string
  const relativeTime = useMemo(() => {
    const diffMs = now.getTime() - currentTime.getTime()
    const diffHours = diffMs / (60 * 60 * 1000)

    if (diffHours < 0.017) return 'agora'
    if (diffHours < 1) return `${Math.round(diffHours * 60)}m atrás`
    if (diffHours < 24) return `${Math.round(diffHours)}h atrás`
    return `${Math.round(diffHours / 24)}d atrás`
  }, [now, currentTime])

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const minutes = parseFloat(e.target.value)
    const newTime = new Date(
      fortyEightHoursAgo.getTime() + minutes * 60 * 1000
    )
    onChange(newTime.toISOString())
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[80%] max-w-[700px] z-[1000]">
      {/* Main container */}
      <div className="bg-[#111827]/90 backdrop-blur rounded-lg border border-white/10 p-3 shadow-lg">
        {/* Controls and display row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause button */}
          <button
            onClick={onTogglePlay}
            className="flex-shrink-0 p-2 rounded-md hover:bg-white/10 transition-colors text-[#f9fafb] hover:text-[#3b82f6] active:scale-95"
            aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
          >
            {isPlaying ? (
              <Pause size={18} className="fill-current" />
            ) : (
              <Play size={18} className="fill-current" />
            )}
          </button>

          {/* Slider container */}
          <div className="flex-1 flex flex-col gap-1">
            {/* Slider input */}
            <div className="relative">
              <input
                type="range"
                min="0"
                max="2880"
                value={sliderPosition}
                onChange={handleSliderChange}
                className="w-full h-1.5 bg-[#1f2937] rounded-full appearance-none cursor-pointer accent-[#3b82f6] slider-thumb"
                style={{
                  backgroundImage: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(sliderPosition / 2880) * 100}%, #1f2937 ${(sliderPosition / 2880) * 100}%, #1f2937 100%)`,
                }}
              />
            </div>

            {/* Tick marks */}
            <div className="relative h-5">
              {tickMarks.map((tick) => (
                <div key={tick.label} className="absolute flex flex-col items-center">
                  {/* Tick line */}
                  <div
                    className="w-0.5 h-1.5 bg-[#4b5563] mb-0.5"
                    style={{ left: `calc(${tick.position}% - 1px)` }}
                  />
                  {/* Tick label */}
                  <span
                    className="text-xs text-[#9ca3af] whitespace-nowrap"
                    style={{
                      left: `calc(${tick.position}% - 18px)`,
                      position: 'absolute',
                      top: '4px',
                    }}
                  >
                    {tick.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Time display and live badge */}
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-2 justify-end">
              {isLive && (
                <span className="inline-block px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded border border-red-500/30">
                  LIVE
                </span>
              )}
              <div className="text-right">
                <div className="text-sm font-medium text-[#f9fafb]">
                  {formattedTime}
                </div>
                <div className="text-xs text-[#9ca3af]">
                  {relativeTime}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slider thumb styles injected via global CSS in index.css */}
    </div>
  )
}
