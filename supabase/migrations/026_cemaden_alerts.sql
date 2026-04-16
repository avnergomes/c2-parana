-- Migration 026: CEMADEN alerts ingestion (Fase 5.A)
--
-- Armazena alertas geologicos/hidrologicos ativos do CEMADEN (Defesa Civil Nacional).
-- Fonte: http://sws.cemaden.gov.br/PED/rest/alertas?uf=PR
-- Atualizacao: a cada 30 min via cron-cemaden.yml
--
-- Severidade segue escala oficial CEMADEN:
--   observacao   -> risco potencial, baixa atencao
--   atencao      -> risco em evolucao
--   alerta       -> risco alto, acao recomendada
--   alerta_maximo -> risco iminente, acao obrigatoria

CREATE TABLE IF NOT EXISTS cemaden_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_code TEXT NOT NULL,                                     -- ID do alerta no CEMADEN
  uf TEXT NOT NULL DEFAULT 'PR',
  municipality TEXT NOT NULL,
  ibge_code TEXT,                                               -- matched via pr_municipios.json
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'geologico',
    'hidrologico',
    'meteorologico',
    'movimento_massa',
    'alagamento',
    'inundacao',
    'enxurrada',
    'erosao',
    'outro'
  )),
  severity TEXT NOT NULL CHECK (severity IN (
    'observacao',
    'atencao',
    'alerta',
    'alerta_maximo'
  )),
  description TEXT,
  affected_area_km2 NUMERIC,
  geometry_geojson JSONB,                                       -- Point ou Polygon
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  source_url TEXT,
  raw_payload JSONB,                                            -- full response for debugging
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(alert_code, issued_at)
);

CREATE INDEX idx_cemaden_alerts_severity ON cemaden_alerts(severity);
CREATE INDEX idx_cemaden_alerts_issued ON cemaden_alerts(issued_at DESC);
CREATE INDEX idx_cemaden_alerts_ibge ON cemaden_alerts(ibge_code);
CREATE INDEX idx_cemaden_alerts_type ON cemaden_alerts(alert_type);
-- Note: indice sem filtro WHERE expires_at > now() porque now() nao e IMMUTABLE
-- no Postgres e predicados de indice parcial exigem funcoes IMMUTABLE. O filtro
-- por alertas ativos e feito no hook via .or(`expires_at.is.null,expires_at.gt.${now}`).
CREATE INDEX idx_cemaden_alerts_severity_issued
  ON cemaden_alerts(severity, issued_at DESC);

-- RLS: leitura anonima (dashboard publico)
ALTER TABLE cemaden_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_cemaden_alerts"
  ON cemaden_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_cemaden_alerts"
  ON cemaden_alerts FOR ALL TO service_role USING (true);

-- Ampliar CHECK de alert_rules.domain para aceitar 'cemaden' como novo dominio
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_domain_check;
ALTER TABLE alert_rules
  ADD CONSTRAINT alert_rules_domain_check
  CHECK (domain IN ('clima','saude','ambiente','hidro','ar','composto','cemaden'));

-- Adicionar realtime publication para cemaden_alerts
ALTER PUBLICATION supabase_realtime ADD TABLE cemaden_alerts;
