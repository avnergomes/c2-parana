// src/components/incidents/IncidentReport.tsx
// Post-incident report display (Fase 4.G)
import { useState } from 'react'
import { FileText, Clock, Target, AlertCircle, Loader2, Check, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useIncidentReport,
  useGenerateIncidentReport,
  useUpdateLessonsLearned,
} from '@/hooks/useIncidentReport'
import { usePlaybooks } from '@/hooks/usePlaybooks'
import type { Incident, IncidentAction } from '@/types/incident'

export function IncidentReport({
  incident,
  actions,
}: {
  incident: Incident
  actions: IncidentAction[]
}) {
  const { data: report, isLoading } = useIncidentReport(incident.id)
  const { data: playbooks } = usePlaybooks()
  const generate = useGenerateIncidentReport()
  const updateLessons = useUpdateLessonsLearned()
  const [lessons, setLessons] = useState('')

  const isClosed = incident.status === 'closed' || incident.status === 'resolved'

  if (!isClosed) {
    return null
  }

  const playbook = incident.playbook_id && playbooks
    ? playbooks.find((p) => p.id === incident.playbook_id) || null
    : null

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-background-secondary border border-border">
        <Loader2 size={20} className="animate-spin text-text-muted mx-auto" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="p-6 rounded-lg bg-background-secondary border border-border text-center space-y-3">
        <FileText size={32} className="mx-auto text-text-muted opacity-50" />
        <p className="text-sm text-text-muted">
          Nenhum relatorio gerado ainda para este incidente
        </p>
        <button
          onClick={() => generate.mutate({ incident, actions, playbook })}
          disabled={generate.isPending}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
            'bg-accent-green text-white hover:bg-accent-green/90',
            'disabled:opacity-50',
          )}
        >
          {generate.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileText size={14} />
          )}
          Gerar Relatorio
        </button>
        {generate.isError && (
          <p className="text-xs text-red-400">
            Erro: {(generate.error as Error).message}
          </p>
        )}
      </div>
    )
  }

  const handleSaveLessons = () => {
    if (!lessons.trim()) return
    updateLessons.mutate({ incidentId: incident.id, lessons: lessons.trim() })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-accent-green" />
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Relatorio Pos-Incidente
        </h3>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          icon={<Clock size={14} />}
          label="Duracao total"
          value={`${report.summary.duration_hours}h`}
        />
        <Metric
          icon={<Target size={14} />}
          label="Tempo de resposta"
          value={
            report.metrics.response_time_minutes != null
              ? `${report.metrics.response_time_minutes}min`
              : '—'
          }
        />
        <Metric
          icon={<Check size={14} />}
          label="Tempo de resolucao"
          value={
            report.metrics.resolution_time_hours != null
              ? `${report.metrics.resolution_time_hours}h`
              : '—'
          }
        />
        <Metric
          icon={<AlertCircle size={14} />}
          label="Escalations"
          value={String(report.metrics.escalation_count)}
        />
      </div>

      {/* Playbook compliance */}
      {report.playbook_compliance != null && (
        <div className="p-4 rounded-lg bg-background-secondary border border-border">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={16} className="text-text-muted" />
            <h4 className="text-sm font-semibold text-text-primary">Playbook Compliance</h4>
            <span className={cn(
              'ml-auto text-lg font-bold',
              report.playbook_compliance >= 80 ? 'text-accent-green' :
                report.playbook_compliance >= 50 ? 'text-orange-400' : 'text-red-400',
            )}>
              {report.playbook_compliance}%
            </span>
          </div>
          <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                report.playbook_compliance >= 80 ? 'bg-accent-green' :
                  report.playbook_compliance >= 50 ? 'bg-orange-500' : 'bg-red-500',
              )}
              style={{ width: `${report.playbook_compliance}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-2">
            {report.metrics.playbook_steps_completed} passos concluidos
          </p>
        </div>
      )}

      {/* Lessons learned */}
      <div className="p-4 rounded-lg bg-background-secondary border border-border">
        <h4 className="text-sm font-semibold text-text-primary mb-2">Licoes Aprendidas</h4>
        {report.lessons_learned ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">
            {report.lessons_learned}
          </p>
        ) : (
          <div className="space-y-2">
            <textarea
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="O que funcionou bem? O que pode ser melhorado? Padroes identificados?"
              rows={4}
              className={cn(
                'w-full px-3 py-2 text-sm rounded border border-border',
                'bg-background-elevated text-text-primary',
                'focus:outline-none focus:ring-1 focus:ring-accent-green',
                'resize-none',
              )}
            />
            <button
              onClick={handleSaveLessons}
              disabled={!lessons.trim() || updateLessons.isPending}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md font-medium',
                'bg-accent-green text-white hover:bg-accent-green/90',
                'disabled:opacity-50',
              )}
            >
              {updateLessons.isPending ? 'Salvando...' : 'Salvar licoes aprendidas'}
            </button>
          </div>
        )}
      </div>

      {/* Regenerate button */}
      <div className="flex justify-end">
        <button
          onClick={() => generate.mutate({ incident, actions, playbook })}
          disabled={generate.isPending}
          className={cn(
            'text-xs text-text-muted hover:text-text-primary transition-colors',
            'disabled:opacity-50',
          )}
        >
          {generate.isPending ? 'Regenerando...' : 'Regenerar relatorio com dados atuais'}
        </button>
      </div>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="p-3 rounded-lg bg-background-secondary border border-border">
      <div className="flex items-center gap-2 text-text-muted mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold text-text-primary">{value}</p>
    </div>
  )
}
