-- Migration 011: IRTC scores table
-- Índice de Risco Territorial Composto

CREATE TABLE IF NOT EXISTS irtc_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ibge_code TEXT NOT NULL,
  municipality TEXT NOT NULL,
  irtc_score NUMERIC NOT NULL DEFAULT 0,
  risk_clima NUMERIC NOT NULL DEFAULT 0,
  risk_saude NUMERIC NOT NULL DEFAULT 0,
  risk_ambiente NUMERIC NOT NULL DEFAULT 0,
  risk_hidro NUMERIC NOT NULL DEFAULT 0,
  risk_ar NUMERIC NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'baixo',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ibge_code)
);

ALTER TABLE irtc_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "irtc_read" ON irtc_scores FOR SELECT USING (true);
CREATE POLICY "irtc_service_write" ON irtc_scores FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_irtc_ibge ON irtc_scores(ibge_code);
CREATE INDEX idx_irtc_level ON irtc_scores(risk_level);
