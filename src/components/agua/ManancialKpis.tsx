// src/components/agua/ManancialKpis.tsx
import { KpiCard } from '@/components/ui/KpiCard'
import { useManancialKpis } from '@/hooks/useInfoHidro'
import { disponibilidadeToLabel } from '@/types/manancial'

export function ManancialKpis() {
  const { data: kpis, isLoading } = useManancialKpis()

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Mananciais"
        value={kpis?.total_mananciais ?? '—'}
        accentColor="blue"
        loading={isLoading}
      />
      <KpiCard
        label="Em alerta"
        value={kpis?.em_alerta ?? '—'}
        accentColor={kpis && kpis.em_alerta > 0 ? 'red' : 'green'}
        loading={isLoading}
      />
      <KpiCard
        label="Disponibilidade média"
        value={kpis ? disponibilidadeToLabel(kpis.disponibilidade_media) : '—'}
        accentColor={kpis?.disponibilidade_media === 'critico' ? 'red' : kpis?.disponibilidade_media === 'baixo' ? 'yellow' : 'blue'}
        loading={isLoading}
      />
      <KpiCard
        label="Municípios"
        value={kpis?.municipios_monitorados ?? '—'}
        accentColor="green"
        loading={isLoading}
      />
    </div>
  )
}
