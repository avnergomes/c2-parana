// src/components/ui/LoadingScreen.tsx
export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-accent-green border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-text-secondary text-sm font-mono">Carregando C2 Paraná...</p>
      </div>
    </div>
  )
}
