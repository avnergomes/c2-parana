-- Migration 016: Add coverage-normalized IRTC columns
--
-- The original IRTC formula treated missing data (no weather station,
-- no river gauge, no AQICN sensor) as score=0, making it impossible
-- for ~395/399 municipalities to exceed "baixo" risk level even during
-- genuine crises. The ETL now normalizes by available coverage, and
-- these new columns expose that normalization to the frontend.
--
-- data_coverage: fraction (0..1) of domain weights with real sensor data
--   e.g., 0.45 = only saude (0.25) + ambiente (0.20) have data
-- max_domain_score: highest individual domain risk score (0-100)
-- dominant_domain: which domain has the highest score (clima/saude/ambiente/hidro/ar)

ALTER TABLE irtc_scores ADD COLUMN IF NOT EXISTS data_coverage NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE irtc_scores ADD COLUMN IF NOT EXISTS max_domain_score NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE irtc_scores ADD COLUMN IF NOT EXISTS dominant_domain TEXT;
