// src/types/noticias.ts
export interface NoticiaItem {
  id: string
  source: 'gazeta' | 'g1pr' | 'aen' | 'bandab' | 'gnews' | 'alep'
  title: string
  description: string | null
  url: string
  image_url: string | null
  published_at: string
  urgency: 'urgent' | 'important' | 'normal'
  category: string | null
  keywords: string[] | null
  fetched_at: string
}

export interface LegislativoItem {
  id: string
  external_id: string | null
  type: 'projeto_lei' | 'sessao' | 'votacao' | 'noticia'
  number: string | null
  year: number | null
  title: string
  description: string | null
  author: string | null
  status: string | null
  url: string | null
  published_at: string | null
}

export const SOURCE_CONFIG: Record<NoticiaItem['source'], { label: string; color: string; url: string }> = {
  gazeta: { label: 'Gazeta do Povo', color: '#3b82f6', url: 'gazetadopovo.com.br' },
  g1pr: { label: 'G1 Paraná', color: '#ef4444', url: 'g1.globo.com' },
  aen: { label: 'AEN PR', color: '#10b981', url: 'parana.pr.gov.br' },
  bandab: { label: 'Banda B', color: '#f59e0b', url: 'bandab.com.br' },
  gnews: { label: 'Google News', color: '#9ca3af', url: 'news.google.com' },
  alep: { label: 'ALEP', color: '#8b5cf6', url: 'assembleia.pr.leg.br' },
}

export const URGENCY_CONFIG = {
  urgent: { color: '#ef4444', bg: 'bg-red-900/30', border: 'border-red-700/50', label: '🔴 URGENTE' },
  important: { color: '#f59e0b', bg: 'bg-amber-900/30', border: 'border-amber-700/50', label: '🟡 IMPORTANTE' },
  normal: { color: '#4b5563', bg: '', border: 'border-border', label: '' },
}

// Keywords para classificação de urgência (também usadas no ETL)
export const URGENT_KEYWORDS = [
  'acidente', 'emergência', 'tragédia', 'morto', 'mortes', 'vítima', 'grave',
  'explosão', 'incêndio', 'enchente', 'desastre', 'colapso', 'desabamento',
  'epidemia', 'surto', 'alerta máximo', 'evacuação', 'bloqueio', 'interdição',
]

export const IMPORTANT_KEYWORDS = [
  'decreto', 'lei aprovada', 'votação', 'aprovado', 'vetado', 'sancionado',
  'operação policial', 'prisão', 'preso', 'investigação', 'auditoria',
  'chuva intensa', 'temporal', 'granizo', 'seca', 'estiagem',
  'reajuste', 'aumento', 'queda', 'recorde', 'histórico',
]
