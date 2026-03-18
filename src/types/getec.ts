// src/types/getec.ts

export interface GetecTopMunicipio {
  municipio_code: number
  municipio: string
  total: number
  ativos: number
}

export interface GetecKpis {
  total_clientes: number
  clientes_ativos: number
  clientes_inativos: number
  taxa_atividade: number
  municipios_atendidos: number
  genero_masculino: number
  genero_feminino: number
  genero_outro: number
  top_municipios: GetecTopMunicipio[]
  data_referencia: string
}

export interface GetecMunicipio {
  municipio_code: number
  municipio: string
  total: number
  ativos: number
  inativos: number
  taxa_atividade: number
  masculino: number
  feminino: number
}
