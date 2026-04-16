// src/components/saude/InternacoesSUS.tsx
// Fase 5.F — chart de internações SUS agregadas por capítulo CID
import { useMemo, useState } from 'react'
import { Activity, AlertCircle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useDatasusSih } from '@/hooks/useDatasusSih'

const CAPITULOS_DESTAQUE: Array<{ id: number; label: string; color: string }> = [
  { id: 10, label: 'Respiratório', color: '#3b82f6' },
  { id: 9, label: 'Circulatório', color: '#ef4444' },
  { id: 1, label: 'Infecciosas', color: '#f97316' },
  { id: 11, label: 'Digestivo', color: '#8b5cf6' },
  { id: 15, label: 'Gravidez/parto', color: '#10b981' },
  { id: 19, label: 'Lesões/envenen.', color: '#eab308' },
]

interface Props {
  ibge?: string | null
}

export function InternacoesSUS({ ibge }: Props) {
  const [capitulo, setCapitulo] = useState<number>(10) // default: Respiratório
  const { data, isLoading, isError } = useDatasusSih({
    ibge,
    months: 12,
    cidChapter: capitulo,
  })

  const chartData = useMemo(() => {
    if (!data) return []
    const byMonth: Record<string, { internacoes: number; obitos: number }> = {}
    for (const row of data) {
      const month = row.competencia.slice(0, 7) // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { internacoes: 0, obitos: 0 }
      byMonth[month].internacoes += row.internacoes
      byMonth[month].obitos += row.obitos
    }
    return Object.entries(byMonth)
      .map(([month, v]) => ({
        mes: month.slice(2).replace('-', '/'),
        internacoes: v.internacoes,
        obitos: v.obitos,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
  }, [data])

  const totalInternacoes = chartData.reduce((s, r) => s + r.internacoes, 0)
  const totalObitos = chartData.reduce((s, r) => s + r.obitos, 0)

  const current = CAPITULOS_DESTAQUE.find((c) => c.id === capitulo)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Activity size={16} className="text-accent-green" />
            Internações SUS (DataSUS SIH)
          </h3>
          <p className="text-2xs text-text-muted mt-0.5">
            {ibge
              ? `Município IBGE ${ibge} · últimos 12 meses`
              : 'Agregado estadual · últimos 12 meses'}
            {totalInternacoes > 0 && (
              <>
                {' '}
                · {totalInternacoes.toLocaleString('pt-BR')} internações
                {totalObitos > 0 && `, ${totalObitos} óbitos`}
              </>
            )}
          </p>
        </div>
        <select
          value={capitulo}
          onChange={(e) => setCapitulo(Number(e.target.value))}
          className="text-xs bg-background-elevated border border-border rounded-md px-2 py-1 text-text-secondary"
        >
          {CAPITULOS_DESTAQUE.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="h-40 bg-background-elevated rounded animate-pulse" />
      ) : isError ? (
        <div className="text-xs text-text-muted italic py-8 text-center flex items-center justify-center gap-2">
          <AlertCircle size={14} />
          DataSUS SIH indisponível. Primeiro run do cron mensal acontece dia 5 do
          mês seguinte.
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-xs text-text-muted italic py-8 text-center">
          Nenhum dado de internações para este capítulo ainda.
          <br />
          <span className="text-2xs">
            O ETL mensal rodou mas não encontrou registros — pode indicar backfill
            pendente.
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="internacoes"
              fill={current?.color ?? '#3b82f6'}
              radius={[4, 4, 0, 0]}
              name="Internações"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
