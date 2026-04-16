-- Migration 028: DataSUS SIH (Morbidade Hospitalar) — Fase 5.F
--
-- Armazena internacoes hospitalares do SUS agregadas por municipio (IBGE),
-- mes de competencia e capitulo CID-10. Fonte: arquivos RDxxAAMM.dbc do
-- FTP ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS/
--
-- A agregacao e feita no ETL (etl_datasus.py) que le os DBCs mensais via
-- pysus e gera (ibge_code, competencia, cid_chapter, counts) sumarizados.

CREATE TABLE IF NOT EXISTS datasus_sih (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ibge_code TEXT NOT NULL,                      -- 7 digitos (SIH usa 6 mas preservamos 7)
  competencia DATE NOT NULL,                    -- primeiro dia do mes
  cid_chapter SMALLINT,                         -- 1-22 (null = total)
  cid_chapter_label TEXT,                       -- ex: 'Doencas do aparelho respiratorio'
  internacoes INT NOT NULL DEFAULT 0,           -- total de AIHs pagas
  obitos INT NOT NULL DEFAULT 0,
  valor_total_reais NUMERIC(14, 2),             -- soma do valor total das AIHs
  dias_permanencia INT,                         -- total de dias de internacao
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ibge_code, competencia, cid_chapter)
);

CREATE INDEX idx_sih_ibge ON datasus_sih(ibge_code);
CREATE INDEX idx_sih_competencia ON datasus_sih(competencia DESC);
CREATE INDEX idx_sih_ibge_cid ON datasus_sih(ibge_code, cid_chapter);
CREATE INDEX idx_sih_cid_competencia
  ON datasus_sih(cid_chapter, competencia DESC);

-- RLS: leitura anonima (dashboard publico)
ALTER TABLE datasus_sih ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_datasus_sih"
  ON datasus_sih FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_datasus_sih"
  ON datasus_sih FOR ALL TO service_role USING (true);

-- Tabela de status/controle das importacoes mensais (evita reprocessar)
CREATE TABLE IF NOT EXISTS datasus_sih_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia DATE NOT NULL UNIQUE,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'partial')),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE datasus_sih_ingestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_sih_log"
  ON datasus_sih_ingestion_log FOR ALL TO service_role USING (true);
