// src/pages/TendenciasPage.tsx
import { TrendingUp, Thermometer, Flame, Bug, Shield, AlertTriangle } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  useTemperaturaTrend,
  useFocosTrend,
  useDengueTrend,
  useIRTCDistribuicao,
} from '@/hooks/useTendencias'
import { useAnomalias } from '@/hooks/useAnomalias'

const IRTC_COLORS: Record<string, string> = {
  baixo: '#10b981',
  medio: '#f59e0b',
  alto: '#f97316',
  critico: '#ef4444',
}

const IRTC_LABELS: Record<string, string> = {
  baixo: 'Baixo',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Critico',
}

function ChartCard({
  title,
  icon,
  children,
  subtitle,
  loading,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  subtitle?: string
  loading?: boolean
}) {
  return (
    <div className="card border border-border rounded-lg overflow-hidden">
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">{icon}</span>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        {subtitle && <p className="text-2xs text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-2 pb-4">
        {loading ? (
          <div className="h-48 bg-background-elevated rounded animate-pulse" />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function TemperaturaChart() {
  const { data, isLoading } = useTemperaturaTrend(72)

  return (
    <ChartCard
      title="Temperatura Media Estadual"
      icon={<Thermometer size={16} />}
      subtitle="Ultimas 72 horas (media por hora, todas as estacoes)"
      loading={isLoading}
    >
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="hora"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              interval={Math.max(0, Math.floor(data.length / 8) - 1)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              domain={['auto', 'auto']}
              unit="°"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
              formatter={(val: number) => [`${val}°C`, 'Temperatura']}
            />
            <Line
              type="monotone"
              dataKey="temp"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-text-muted text-center py-12">Sem dados de temperatura nas ultimas 72h</p>
      )}
    </ChartCard>
  )
}

function FocosChart() {
  const { data, isLoading } = useFocosTrend(7)

  const total = data?.reduce((s, d) => s + d.focos, 0) || 0

  return (
    <ChartCard
      title="Focos de Incendio"
      icon={<Flame size={16} />}
      subtitle={`Ultimos 7 dias${total > 0 ? ` (${total} total)` : ''}`}
      loading={isLoading}
    >
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="data" tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
              formatter={(val: number) => [`${val}`, 'Focos']}
            />
            <Bar dataKey="focos" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-text-muted text-center py-12">Sem dados de focos nos ultimos 7 dias</p>
      )}
    </ChartCard>
  )
}

function DengueChart() {
  const { data, isLoading } = useDengueTrend(8)

  const lastTwo = data?.slice(-2) || []
  const delta = lastTwo.length === 2 && lastTwo[0].casos > 0
    ? Math.round(((lastTwo[1].casos - lastTwo[0].casos) / lastTwo[0].casos) * 100)
    : null

  return (
    <ChartCard
      title="Casos de Dengue por Semana"
      icon={<Bug size={16} />}
      subtitle={`Ultimas 8 semanas epidemiologicas${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta}% vs anterior)` : ''}`}
      loading={isLoading}
    >
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="semana"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v: string) => v.split('-')[1] || v}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
              formatter={(val: number) => [`${val.toLocaleString('pt-BR')}`, 'Casos']}
            />
            <Bar dataKey="casos" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-text-muted text-center py-12">Sem dados de dengue disponiveis</p>
      )}
    </ChartCard>
  )
}

function IRTCGauge() {
  const { data, isLoading } = useIRTCDistribuicao()

  const pieData = data
    ? ['baixo', 'medio', 'alto', 'critico']
        .map(level => ({
          name: IRTC_LABELS[level],
          value: data[level as keyof typeof data] as number,
          color: IRTC_COLORS[level],
        }))
        .filter(d => d.value > 0)
    : []

  return (
    <ChartCard
      title="Distribuicao IRTC"
      icon={<Shield size={16} />}
      subtitle={data ? `${data.total} municipios | Media: ${data.media}` : undefined}
      loading={isLoading}
    >
      {pieData.length > 0 ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number) => [`${val} municipios`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-text-secondary flex-1">{d.name}</span>
                <span className="text-sm font-mono font-semibold text-text-primary">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-12">Sem dados IRTC disponiveis</p>
      )}
    </ChartCard>
  )
}

const INDICATOR_UNIT: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  aqi: ' AQI',
}

function AnomaliasPanel() {
  const { data: anomalias, isLoading } = useAnomalias(7)

  return (
    <ChartCard
      title="Anomalias Estatisticas"
      icon={<AlertTriangle size={16} />}
      subtitle="Ultimos 7 dias (z-score > 3)"
      loading={isLoading}
    >
      {anomalias && anomalias.length > 0 ? (
        <div className="space-y-2 px-2">
          {anomalias.slice(0, 8).map(a => {
            const unit = INDICATOR_UNIT[a.indicator] || ''
            const direction = a.z_score > 0 ? 'acima' : 'abaixo'
            const severity = Math.abs(a.z_score) >= 4 ? 'text-status-danger' : 'text-status-warning'
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/30 last:border-0">
                <AlertTriangle size={12} className={severity} />
                <span className="text-text-primary font-medium flex-1">
                  {a.municipality || a.station_code}
                </span>
                <span className="text-text-secondary">
                  {a.indicator} {direction}
                </span>
                <span className="font-mono text-text-primary">
                  {a.observed_value}{unit}
                </span>
                <span className={`font-mono text-2xs ${severity}`}>
                  z={a.z_score.toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-12">
          Nenhuma anomalia detectada nos ultimos 7 dias.
          O detector precisa de 30+ observacoes por estacao para funcionar.
        </p>
      )}
    </ChartCard>
  )
}

export function TendenciasPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <TrendingUp size={24} />
          Tendencias
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Visao consolidada das tendencias recentes por dominio
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TemperaturaChart />
        <FocosChart />
        <DengueChart />
        <IRTCGauge />
        <AnomaliasPanel />
      </div>
    </div>
  )
}
