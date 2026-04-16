// src/components/reconhecimento/MunicipioSituacao.tsx
// Fase 5.D — grid de indicadores atuais do município
import { Thermometer, Flame, Bug, Wind, AlertTriangle, Gauge } from 'lucide-react'
import { getIRTCColor } from '@/hooks/useIRTC'
import type { ReconhecimentoSnapshot } from '@/hooks/useReconhecimento'
import { timeAgo } from '@/lib/utils'

interface Props {
  snapshot: ReconhecimentoSnapshot
  municipalityName: string | null
}

export function MunicipioSituacao({ snapshot, municipalityName }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <IRTCCard snapshot={snapshot} />
      <ClimaCard snapshot={snapshot} />
      <FireCard snapshot={snapshot} municipalityName={municipalityName} />
      <DengueCard snapshot={snapshot} />
      <ArCard snapshot={snapshot} />
      <CemadenCard snapshot={snapshot} />
    </div>
  )
}

function StatCardShell({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      className="card p-4 border-l-4 min-h-[148px]"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider mb-2">
        <span style={{ color: accent }}>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

function IRTCCard({ snapshot }: { snapshot: ReconhecimentoSnapshot }) {
  const irtc = snapshot.irtc
  const score = irtc?.score ?? null
  const accent = score !== null ? getIRTCColor(score) : '#94a3b8'
  return (
    <StatCardShell title="IRTC" icon={<Gauge size={14} />} accent={accent}>
      <div className="flex items-end gap-2">
        <p
          className="text-3xl font-bold"
          style={{ color: accent }}
        >
          {score !== null ? score.toFixed(0) : '—'}
        </p>
        <span className="text-sm text-text-muted pb-1">/ 100</span>
      </div>
      <p className="text-xs text-text-secondary capitalize mt-1">
        {irtc?.level ?? 'sem dados'}
      </p>
      {irtc?.coverage !== null && irtc?.coverage !== undefined && (
        <p className="text-2xs text-text-muted mt-1">
          Cobertura de dados: {Math.round((irtc.coverage ?? 0) * 100)}%
          {irtc.dominantDomain && ` · domínio dominante: ${irtc.dominantDomain}`}
        </p>
      )}
    </StatCardShell>
  )
}

function ClimaCard({ snapshot }: { snapshot: ReconhecimentoSnapshot }) {
  const latest = snapshot.climate[0]
  const accent = latest?.temperature != null && latest.temperature > 32
    ? '#ef4444'
    : '#3b82f6'
  return (
    <StatCardShell title="Clima" icon={<Thermometer size={14} />} accent={accent}>
      {latest ? (
        <div className="space-y-1">
          <p className="text-2xl font-bold text-text-primary">
            {latest.temperature != null ? latest.temperature.toFixed(1) : '—'}°C
          </p>
          <p className="text-xs text-text-secondary">
            Umidade {latest.humidity != null ? latest.humidity.toFixed(0) : '—'}% ·{' '}
            Chuva {latest.precipitation != null ? latest.precipitation.toFixed(1) : '0'} mm
          </p>
          <p className="text-2xs text-text-muted">{timeAgo(latest.observed_at)}</p>
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">Sem leitura recente</p>
      )}
    </StatCardShell>
  )
}

function FireCard({
  snapshot,
  municipalityName,
}: {
  snapshot: ReconhecimentoSnapshot
  municipalityName: string | null
}) {
  const fires = snapshot.fires.filter(
    (f) => !municipalityName || !('municipality' in f) ||
           (f as { municipality?: string }).municipality === municipalityName
  )
  const total = fires.length
  const accent = total > 10 ? '#ef4444' : total > 0 ? '#f59e0b' : '#10b981'
  return (
    <StatCardShell title="Focos FIRMS (7d)" icon={<Flame size={14} />} accent={accent}>
      <p className="text-3xl font-bold" style={{ color: accent }}>
        {total}
      </p>
      <p className="text-xs text-text-secondary mt-1">
        {total > 0 ? 'focos detectados' : 'sem focos no período'}
      </p>
      {fires[0] && (
        <p className="text-2xs text-text-muted mt-1">
          Último em {fires[0].acq_date}
        </p>
      )}
    </StatCardShell>
  )
}

function DengueCard({ snapshot }: { snapshot: ReconhecimentoSnapshot }) {
  const latest = snapshot.dengue[0]
  const prev = snapshot.dengue[1]
  const level = latest?.alert_level ?? null
  const accent =
    level === 4 ? '#ef4444' :
    level === 3 ? '#f97316' :
    level === 2 ? '#eab308' :
    '#10b981'
  const delta =
    latest?.cases != null && prev?.cases != null
      ? latest.cases - prev.cases
      : null
  return (
    <StatCardShell title="Dengue (SE atual)" icon={<Bug size={14} />} accent={accent}>
      {latest ? (
        <div className="space-y-1">
          <p className="text-2xl font-bold text-text-primary">
            {latest.cases ?? 0} <span className="text-sm text-text-muted">casos</span>
          </p>
          <p className="text-xs text-text-secondary">
            Nível {level ?? '—'} · SE {latest.epidemiological_week}/{latest.year}
          </p>
          {delta !== null && (
            <p
              className="text-2xs"
              style={{ color: delta > 0 ? '#ef4444' : '#10b981' }}
            >
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} vs SE anterior
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">Sem dados InfoDengue</p>
      )}
    </StatCardShell>
  )
}

function ArCard({ snapshot }: { snapshot: ReconhecimentoSnapshot }) {
  const nearest = snapshot.airQuality[0]
  const aqi = nearest?.aqi ?? null
  const accent =
    aqi != null && aqi > 150 ? '#ef4444' :
    aqi != null && aqi > 100 ? '#f97316' :
    aqi != null && aqi > 50 ? '#eab308' :
    '#10b981'
  return (
    <StatCardShell title="Qualidade do Ar" icon={<Wind size={14} />} accent={accent}>
      {nearest ? (
        <div className="space-y-1">
          <p className="text-3xl font-bold" style={{ color: accent }}>
            {aqi ?? '—'}
          </p>
          <p className="text-xs text-text-secondary">
            AQI · {nearest.dominant_pollutant ?? 'sem poluente dominante'}
          </p>
          <p className="text-2xs text-text-muted">
            Estação próxima: {nearest.city}
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">Sem estação próxima</p>
      )}
    </StatCardShell>
  )
}

function CemadenCard({ snapshot }: { snapshot: ReconhecimentoSnapshot }) {
  const ativos = snapshot.cemaden
  const top = ativos[0]
  const accent =
    top?.severity === 'alerta_maximo' ? '#ef4444' :
    top?.severity === 'alerta' ? '#f97316' :
    top?.severity === 'atencao' ? '#eab308' :
    '#10b981'
  return (
    <StatCardShell title="CEMADEN" icon={<AlertTriangle size={14} />} accent={accent}>
      {top ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: accent }}>
            {top.severity.replace('_', ' ')}
          </p>
          <p className="text-xs text-text-secondary">
            {top.alert_type} · {ativos.length} ativo{ativos.length !== 1 ? 's' : ''}
          </p>
          <p className="text-2xs text-text-muted">{timeAgo(top.issued_at)}</p>
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">
          Sem alertas ativos da Defesa Civil
        </p>
      )}
    </StatCardShell>
  )
}
