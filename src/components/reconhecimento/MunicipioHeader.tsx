// src/components/reconhecimento/MunicipioHeader.tsx
// Fase 5.D — cabeçalho de identificação do município
import { MapPin, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  name: string | null
  ibge: string
  uf: string
}

export function MunicipioHeader({ name, ibge, uf }: Props) {
  return (
    <div className="card p-5 space-y-3">
      <nav className="text-xs text-text-muted flex items-center gap-1">
        <Link to="/mapa" className="hover:text-accent-green">
          Mapa
        </Link>
        <span>/</span>
        <span className="text-text-secondary">Reconhecimento</span>
        <span>/</span>
        <span className="text-text-primary">{name ?? ibge}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
            <MapPin size={24} className="text-accent-green" />
            {name ?? 'Município'}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Perfil completo e situação atual · IBGE {ibge} · {uf}
          </p>
        </div>

        <Link
          to="/mapa"
          className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-green transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao mapa
        </Link>
      </div>
    </div>
  )
}
