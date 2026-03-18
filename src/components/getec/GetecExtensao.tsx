// src/components/getec/GetecExtensao.tsx

export function GetecExtensao() {
  return (
    <div className="card p-8 text-center space-y-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-accent-green/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary">Extensão Rural</h3>
      <p className="text-text-secondary text-sm max-w-md mx-auto">
        Em breve: dados de projetos, ações de extensão rural, extensionistas por município e indicadores de assistência técnica do IDR-Paraná.
      </p>
      <span className="inline-block text-xs font-medium px-3 py-1 rounded-full bg-accent-blue/10 text-accent-blue">
        Em desenvolvimento
      </span>
    </div>
  )
}
