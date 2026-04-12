-- 018: Tabela de anomalias estatisticas (Fase 3.F)
-- Deteccoes de z-score > 3 em series temporais por municipio/estacao.

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,              -- 'clima', 'ar'
  indicator TEXT NOT NULL,           -- 'temperature', 'humidity', 'aqi'
  station_code TEXT,                 -- station or city identifier
  municipality TEXT,
  observed_value NUMERIC NOT NULL,
  z_score NUMERIC NOT NULL,
  window_mean NUMERIC NOT NULL,
  window_stddev NUMERIC NOT NULL,
  window_size INT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain, indicator, station_code, detected_at)
);

CREATE INDEX idx_anomalies_detected ON anomalies(detected_at DESC);
CREATE INDEX idx_anomalies_domain ON anomalies(domain, indicator);

-- RLS: leitura anonima (dashboard publico)
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_anomalies" ON anomalies FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_anomalies" ON anomalies FOR ALL TO service_role USING (true);
