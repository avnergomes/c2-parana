-- Migration 054: IRTC v1.1 — dado por dominio e versao do metodo
--
-- Mesma formula e mesmos pesos do v1 (etl-irtc). As colunas novas deixam
-- explicito o que a media ponderada "so com dominios com dado" ja fazia:
-- dominio sem dado e gravado como risk_* = 0, e sem o flag a ficha mostrava
-- "Clima 0/100" onde nao existe medicao. NULL = linha anterior ao v1.1.
--
-- ORDEM DE DEPLOY: aplicar esta migration ANTES de publicar etl-irtc v1.1
-- (e antes do proximo run de scripts/etl_irtc.py), senao o upsert falha por
-- coluna inexistente.

ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS has_clima BOOLEAN;
ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS has_saude BOOLEAN;
ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS has_ambiente BOOLEAN;
ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS has_hidro BOOLEAN;
ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS has_ar BOOLEAN;
ALTER TABLE public.irtc_scores ADD COLUMN IF NOT EXISTS versao_metodo TEXT;

COMMENT ON COLUMN public.irtc_scores.has_clima IS 'Estacao com leitura de ate 36 h (temperatura/umidade) ou chuva em 72 h';
COMMENT ON COLUMN public.irtc_scores.has_saude IS 'InfoDengue com semana epidemiologica de ate 28 dias';
COMMENT ON COLUMN public.irtc_scores.has_ambiente IS 'Leitura de fire_spots ok nesta execucao (zero focos e dado valido)';
COMMENT ON COLUMN public.irtc_scores.has_hidro IS 'Regua da ANA com nivel lido ha ate 12 h ou alerta CEMADEN hidrologico ativo';
COMMENT ON COLUMN public.irtc_scores.has_ar IS 'Cidade com estacao AQICN (12 cidades)';
COMMENT ON COLUMN public.irtc_scores.versao_metodo IS 'Versao do metodo do etl-irtc que gravou a linha (v1.1 em diante)';

-- Contagem de focos por municipio no IRTC (etl-irtc le fire_spots por
-- ibge_code e acq_date, preenchidos por ponto-no-poligono no etl-ambiente).
CREATE INDEX IF NOT EXISTS idx_fire_spots_ibge_date ON public.fire_spots (ibge_code, acq_date);
