// src/pages/ReconhecimentoPage.tsx
// Fase 5.D — página de reconhecimento aprofundado de um município
import { useParams, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { FileText, AlertTriangle } from 'lucide-react'
import { useReconhecimento } from '@/hooks/useReconhecimento'
import { useMunicipioMetadata, useAllMunicipios } from '@/hooks/useMunicipioMetadata'
import { MunicipioHeader } from '@/components/reconhecimento/MunicipioHeader'
import { MunicipioSituacao } from '@/components/reconhecimento/MunicipioSituacao'
import { MunicipioRadar } from '@/components/reconhecimento/MunicipioRadar'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function ReconhecimentoPage() {
  const { ibge } = useParams<{ ibge: string }>()
  const navigate = useNavigate()

  const validIbge = useMemo(
    () => (ibge && /^\d{7}$/.test(ibge) ? ibge : null),
    [ibge]
  )

  const { data: metadata } = useMunicipioMetadata(validIbge)
  const { data: allMunicipios } = useAllMunicipios()
  const { snapshot, isLoading, isError } = useReconhecimento(validIbge)

  if (!validIbge) {
    return <MunicipioPicker municipios={allMunicipios ?? []} onPick={(id) => navigate(`/reconhecimento/${id}`)} />
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <MunicipioHeader
        name={metadata?.name ?? null}
        ibge={validIbge}
        uf={metadata?.uf ?? 'PR'}
      />

      {isError && (
        <div className="card p-4 border-l-4 border-status-danger text-sm text-text-secondary flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-danger" />
          Falha ao agregar dados; exibindo o que foi carregado.
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Situação atual
        </h2>
        <ErrorBoundary moduleName="situação">
          {isLoading ? (
            <SituacaoSkeleton />
          ) : (
            <MunicipioSituacao
              snapshot={snapshot}
              municipalityName={metadata?.name ?? null}
            />
          )}
        </ErrorBoundary>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Comparação com o estado
        </h2>
        <ErrorBoundary moduleName="radar">
          <MunicipioRadar snapshot={snapshot} />
        </ErrorBoundary>
      </section>

      <section>
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <FileText size={18} className="text-text-muted mt-0.5" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                Exportar perfil
              </p>
              <p className="text-xs text-text-muted">
                Use Ctrl+P (Cmd+P) para gerar PDF com o perfil completo.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="btn-primary text-xs"
          >
            Imprimir / Salvar PDF
          </button>
        </div>
      </section>
    </div>
  )
}

function SituacaoSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-4 h-[148px] animate-pulse">
          <div className="h-3 w-20 bg-background-elevated rounded mb-3" />
          <div className="h-8 w-24 bg-background-elevated rounded mb-2" />
          <div className="h-3 w-32 bg-background-elevated rounded" />
        </div>
      ))}
    </div>
  )
}

interface MunicipioPickerProps {
  municipios: Array<{ ibge: string; name: string }>
  onPick: (ibge: string) => void
}

function MunicipioPicker({ municipios, onPick }: MunicipioPickerProps) {
  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="card p-5">
        <h1 className="text-2xl font-bold text-text-primary">Reconhecimento</h1>
        <p className="text-text-secondary text-sm mt-1">
          Selecione um município para ver o perfil completo.
        </p>
      </div>

      <div className="card p-3 max-h-[70vh] overflow-y-auto">
        <ul className="divide-y divide-border/40">
          {municipios.slice(0, 200).map((m) => (
            <li key={m.ibge}>
              <button
                onClick={() => onPick(m.ibge)}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:text-accent-green hover:bg-background-elevated transition-colors flex items-center justify-between"
              >
                <span>{m.name}</span>
                <span className="text-2xs text-text-muted font-mono">
                  {m.ibge}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {municipios.length > 200 && (
          <p className="text-2xs text-text-muted text-center py-2">
            Mostrando 200 de {municipios.length} municípios. Acesse via URL:
            /reconhecimento/&lt;codigo_ibge&gt;
          </p>
        )}
      </div>
    </div>
  )
}
