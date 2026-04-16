// src/components/reconhecimento/MunicipioRadar.tsx
// Fase 5.D — RadarChart comparando perfil de risco do município com a média estadual
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import type { ReconhecimentoSnapshot } from '@/hooks/useReconhecimento'
import { useIRTC } from '@/hooks/useIRTC'

interface Props {
  snapshot: ReconhecimentoSnapshot
}

interface RadarRow {
  domain: string
  municipio: number
  media_pr: number
}

export function MunicipioRadar({ snapshot }: Props) {
  const { data: allIrtc, summary } = useIRTC()
  const municipioIrtc = snapshot.irtc

  if (!municipioIrtc) {
    return (
      <div className="card p-6 text-center text-text-muted text-sm">
        IRTC indisponível para gerar o radar comparativo.
      </div>
    )
  }

  // Calcula média estadual por domínio
  const mediaEstadual = computeStateAverages(allIrtc)

  const data: RadarRow[] = [
    {
      domain: 'Clima',
      municipio: municipioIrtc.rClima ?? 0,
      media_pr: mediaEstadual.clima,
    },
    {
      domain: 'Saúde',
      municipio: municipioIrtc.rSaude ?? 0,
      media_pr: mediaEstadual.saude,
    },
    {
      domain: 'Ambiente',
      municipio: municipioIrtc.rAmbiente ?? 0,
      media_pr: mediaEstadual.ambiente,
    },
    {
      domain: 'Hídrico',
      municipio: municipioIrtc.rHidro ?? 0,
      media_pr: mediaEstadual.hidro,
    },
    {
      domain: 'Ar',
      municipio: municipioIrtc.rAr ?? 0,
      media_pr: mediaEstadual.ar,
    },
  ]

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Perfil de risco por domínio
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Comparação entre o município e a média dos 399 municípios do PR
          </p>
        </div>
        {summary && (
          <p className="text-2xs text-text-muted">
            Média estadual IRTC:{' '}
            <span className="text-text-secondary font-mono">
              {summary.average.toFixed(1)}
            </span>
          </p>
        )}
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis
              dataKey="domain"
              tick={{ fill: '#cbd5e1', fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Radar
              name="Município"
              dataKey="municipio"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.45}
            />
            <Radar
              name="Média PR"
              dataKey="media_pr"
              stroke="#64748b"
              fill="#64748b"
              fillOpacity={0.2}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#cbd5e1' }} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 4,
                fontSize: 12,
              }}
              formatter={(val: number) => val.toFixed(1)}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <DomainTable data={data} />
    </div>
  )
}

function DomainTable({ data }: { data: RadarRow[] }) {
  return (
    <div className="mt-4 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted uppercase tracking-wider text-2xs">
            <th className="text-left py-1 px-2">Domínio</th>
            <th className="text-right py-1 px-2">Município</th>
            <th className="text-right py-1 px-2">Média PR</th>
            <th className="text-right py-1 px-2">Δ</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const delta = row.municipio - row.media_pr
            const deltaColor =
              delta > 5 ? '#ef4444' : delta < -5 ? '#10b981' : '#94a3b8'
            return (
              <tr
                key={row.domain}
                className="border-t border-border/40 text-text-secondary"
              >
                <td className="py-1.5 px-2">{row.domain}</td>
                <td className="py-1.5 px-2 text-right font-mono">
                  {row.municipio.toFixed(1)}
                </td>
                <td className="py-1.5 px-2 text-right font-mono">
                  {row.media_pr.toFixed(1)}
                </td>
                <td
                  className="py-1.5 px-2 text-right font-mono"
                  style={{ color: deltaColor }}
                >
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function computeStateAverages(
  all: Map<string, { rClima: number; rSaude: number; rAmbiente: number; rHidro: number; rAr: number }> | null
): { clima: number; saude: number; ambiente: number; hidro: number; ar: number } {
  if (!all || all.size === 0) {
    return { clima: 0, saude: 0, ambiente: 0, hidro: 0, ar: 0 }
  }
  let clima = 0
  let saude = 0
  let ambiente = 0
  let hidro = 0
  let ar = 0
  for (const row of all.values()) {
    clima += row.rClima || 0
    saude += row.rSaude || 0
    ambiente += row.rAmbiente || 0
    hidro += row.rHidro || 0
    ar += row.rAr || 0
  }
  const n = all.size
  return {
    clima: clima / n,
    saude: saude / n,
    ambiente: ambiente / n,
    hidro: hidro / n,
    ar: ar / n,
  }
}
