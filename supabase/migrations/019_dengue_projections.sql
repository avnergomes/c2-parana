-- 019: Tabela de projecoes de dengue (Fase 3.C)
-- Regressao linear simples: 8 semanas de historico projeta +4 semanas.

CREATE TABLE IF NOT EXISTS dengue_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ibge_code TEXT NOT NULL,
  municipality TEXT NOT NULL,
  projected_week INT NOT NULL,        -- semana epidemiologica projetada
  projected_year INT NOT NULL,
  projected_cases NUMERIC NOT NULL,
  trend TEXT NOT NULL DEFAULT 'estavel',  -- 'alta', 'estavel', 'queda'
  slope NUMERIC,                      -- inclinacao da regressao (casos/semana)
  r_squared NUMERIC,                  -- qualidade do ajuste (0-1)
  baseline_weeks INT NOT NULL,        -- quantas semanas usadas no calculo
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ibge_code, projected_week, projected_year)
);

CREATE INDEX idx_dengue_proj_muni ON dengue_projections(ibge_code);
CREATE INDEX idx_dengue_proj_week ON dengue_projections(projected_year, projected_week);
CREATE INDEX idx_dengue_proj_trend ON dengue_projections(trend) WHERE trend = 'alta';

-- RLS
ALTER TABLE dengue_projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_dengue_proj" ON dengue_projections FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_dengue_proj" ON dengue_projections FOR ALL TO service_role USING (true);
