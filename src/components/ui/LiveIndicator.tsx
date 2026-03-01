// src/components/ui/LiveIndicator.tsx
interface LiveIndicatorProps {
  label?: string
  size?: 'sm' | 'md'
}

export function LiveIndicator({ label = 'LIVE', size = 'md' }: LiveIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`relative flex ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
        <span className={`relative inline-flex rounded-full bg-accent-green ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
      </span>
      <span className={`font-mono font-semibold text-accent-green ${size === 'sm' ? 'text-2xs' : 'text-xs'}`}>
        {label}
      </span>
    </div>
  )
}
