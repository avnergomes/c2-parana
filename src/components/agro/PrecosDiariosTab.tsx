// src/components/agro/PrecosDiariosTab.tsx
import { useState } from 'react'
import { usePrecosDiarios } from '@/hooks/useAgro'
import { PRODUTOS_DESTAQUE, PRODUTOS_DESTAQUE_MAP } from '@/types/agro'
import { formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonCard'

export function PrecosDiariosTab() {
  const [produto, setProduto] = useState<string>(PRODUTOS_DESTAQUE[0])
  const apiProduto = PRODUTOS_DESTAQUE_MAP[produto] || produto
  const { data: precos, isLoading, isError } = usePrecosDiarios(apiProduto)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {PRODUTOS_DESTAQUE.map(p => (
          <button
            key={p}
            onClick={() => setProduto(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              produto === p
                ? 'bg-accent-green/20 border-accent-green text-accent-green'
                : 'border-border text-text-secondary hover:border-accent-green/50'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {isLoading && <SkeletonList rows={8} />}
      {isError && (
        <div className="card p-4 border-l-2 border-status-warning">
          <p className="text-status-warning text-sm">API de preços indisponível. Tente novamente mais tarde.</p>
          <p className="text-text-muted text-xs mt-1">Os dados de cotações SIMA serão atualizados em breve.</p>
        </div>
      )}

      {precos && Array.isArray(precos) && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-text-muted text-xs font-medium">Produto</th>
                <th className="text-left py-2 px-3 text-text-muted text-xs font-medium">Regional</th>
                <th className="text-left py-2 px-3 text-text-muted text-xs font-medium">Categoria</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Preço</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Unid.</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {precos.slice(0, 30).map((p: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                  <td className="py-2 px-3 text-text-primary font-medium text-xs">{(p.produto as string) || '—'}</td>
                  <td className="py-2 px-3 text-text-secondary text-xs">{(p.regional as string) || '—'}</td>
                  <td className="py-2 px-3 text-text-secondary text-xs">{(p.categoria as string) || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-text-primary">{p.preco ? formatCurrency(p.preco as number, 'BRL') : '—'}</td>
                  <td className="py-2 px-3 text-right text-2xs text-text-muted">{(p.unidade as string) || '—'}</td>
                  <td className="py-2 px-3 text-right text-2xs text-text-muted">{p.data ? formatDate(p.data as string) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
