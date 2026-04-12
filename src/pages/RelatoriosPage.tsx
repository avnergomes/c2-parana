// src/pages/RelatoriosPage.tsx
import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp, AlertTriangle, Shield, TrendingUp } from 'lucide-react'
import { useRelatorios, type SituationalReport } from '@/hooks/useRelatorios'
import { cn } from '@/lib/utils'

const RISK_COLOR: Record<string, string> = {
  baixo: 'text-accent-green',
  medio: 'text-status-warning',
  'médio': 'text-status-warning',
  alto: 'text-orange-400',
  critico: 'text-status-danger',
  'crítico': 'text-status-danger',
}

const DOMAIN_LABEL: Record<string, string> = {
  clima: 'Clima',
  saude: 'Saude',
  ambiente: 'Ambiente',
  hidro: 'Hidrico',
  ar: 'Qualidade do Ar',
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function ReportCard({ report }: { report: SituationalReport }) {
  const [expanded, setExpanded] = useState(false)
  const dist = report.domain_summaries?.irtc_distribuicao || {}
  const altoCount = (dist.alto || 0) + (dist.critico || 0)

  return (
    <div className="card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-background-elevated transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            altoCount > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-accent-green/10 text-accent-green'
          )}>
            {altoCount > 0 ? <AlertTriangle size={20} /> : <Shield size={20} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{formatDate(report.report_date)}</p>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1 max-w-xl">
              {report.executive_summary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {report.active_alerts_count > 0 && (
            <span className="text-xs font-medium text-status-warning bg-status-warning/10 px-2 py-0.5 rounded">
              {report.active_alerts_count} alerta(s)
            </span>
          )}
          {altoCount > 0 && (
            <span className="text-xs font-medium text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
              {altoCount} mun. risco alto
            </span>
          )}
          {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-5 bg-background-secondary/50">
          {/* Executive Summary */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Resumo Executivo</h3>
            <p className="text-sm text-text-primary leading-relaxed">{report.executive_summary}</p>
          </div>

          {/* Top Risks */}
          {report.top_risks?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Top 10 Municipios por Risco (IRTC)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {report.top_risks.map((risk, i) => (
                  <div key={risk.ibge_code} className="flex items-center gap-2 text-xs py-1">
                    <span className="text-text-muted w-5 text-right">{i + 1}.</span>
                    <span className="text-text-primary font-medium flex-1">{risk.municipality}</span>
                    <span className={cn('font-mono font-semibold', RISK_COLOR[risk.risk_level] || 'text-text-secondary')}>
                      {risk.irtc_score?.toFixed(1)}
                    </span>
                    <span className="text-text-muted">
                      {DOMAIN_LABEL[risk.dominant_domain] || risk.dominant_domain}
                    </span>
                    <span className="text-text-muted">{Math.round((risk.data_coverage || 0) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Domain Summaries */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Dominios</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Dengue */}
              {report.domain_summaries?.dengue && (
                <div className="bg-background-elevated rounded-lg p-3">
                  <p className="text-2xs text-text-muted uppercase">Dengue</p>
                  <p className="text-lg font-bold text-text-primary">{report.domain_summaries.dengue.total_cases?.toLocaleString('pt-BR')}</p>
                  <p className="text-2xs text-text-secondary">{report.domain_summaries.dengue.week}</p>
                </div>
              )}
              {/* Clima */}
              {report.domain_summaries?.clima?.avg_temp != null && (
                <div className="bg-background-elevated rounded-lg p-3">
                  <p className="text-2xs text-text-muted uppercase">Clima</p>
                  <p className="text-lg font-bold text-text-primary">{report.domain_summaries.clima.avg_temp}°C</p>
                  <p className="text-2xs text-text-secondary">{report.domain_summaries.clima.stations} estacoes</p>
                </div>
              )}
              {/* Incendios */}
              {report.domain_summaries?.incendios && (
                <div className="bg-background-elevated rounded-lg p-3">
                  <p className="text-2xs text-text-muted uppercase">Incendios</p>
                  <p className="text-lg font-bold text-text-primary">{report.domain_summaries.incendios.total_spots}</p>
                  <p className="text-2xs text-text-secondary">{report.domain_summaries.incendios.affected_municipalities} mun.</p>
                </div>
              )}
              {/* IRTC Distribution */}
              {report.domain_summaries?.irtc_distribuicao && (
                <div className="bg-background-elevated rounded-lg p-3">
                  <p className="text-2xs text-text-muted uppercase">IRTC</p>
                  <div className="flex gap-1.5 mt-1">
                    {['baixo', 'medio', 'alto', 'critico'].map(level => {
                      const count = report.domain_summaries?.irtc_distribuicao?.[level] || 0
                      if (count === 0) return null
                      return (
                        <span key={level} className={cn('text-2xs font-mono', RISK_COLOR[level])}>
                          {count}
                        </span>
                      )
                    })}
                  </div>
                  <p className="text-2xs text-text-secondary">distribuicao</p>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          {report.recommendations && (
            <div>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={14} />
                Recomendacoes
              </h3>
              <div className="text-sm text-text-primary whitespace-pre-line leading-relaxed bg-background-elevated rounded-lg p-3">
                {report.recommendations}
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="text-2xs text-text-muted">
            Gerado em {new Date(report.generated_at).toLocaleString('pt-BR')}
          </p>
        </div>
      )}
    </div>
  )
}

export function RelatoriosPage() {
  const { data: reports, isLoading } = useRelatorios()

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileText size={24} />
          Relatorios Situacionais
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Resumos diarios consolidados de todos os indicadores do Parana
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-background-elevated rounded-lg animate-pulse" />
          ))}
        </div>
      ) : reports?.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum relatorio gerado ainda.</p>
          <p className="text-xs mt-1">O primeiro relatorio sera gerado automaticamente as 06:00 BRT.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports?.map(report => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  )
}
