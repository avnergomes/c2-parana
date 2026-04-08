-- Migration 015: Fixes descobertos na primeira execucao de etl_correlations.py
--
-- Fix 1: Migrar a regra 'IRTC Critico' (migration 012) do schema legado (flat)
-- para o schema composite novo (migration 014), de modo que o
-- etl_correlations.py consiga avaliar ela. Antes ela ficava orfa — nem
-- etl_alerts_engine (que ignora domain='composto') nem etl_correlations
-- (que so entende condition.type='composite') processavam essa regra.
--
-- Fix 2: Ajustar a regra 'Precipitacao Intensa' (migration 012) para usar
-- o nome de campo correto 'precipitation' em vez de 'precipitation_24h'.
-- A coluna climate_data.precipitation ja existe e e populada pelo etl_clima
-- (valor instantaneo em mm); nao temos o acumulado 24h ainda. Como a regra
-- seed original foi escrita contra um campo inexistente, ela nunca disparou.
--
-- Fix 3 (ausente aqui, adiado): os campos 'precipitation_24h' seriam um
-- derivado util, mas podem ser computados em tempo de query por uma view
-- ou no proprio etl_correlations. Nao e urgente — registrado em PLANO_FASE3.md.
--
-- Idempotente: os UPDATEs so mexem na coluna `condition` das regras
-- existentes, por nome. Rodar multiplas vezes nao tem efeito colateral.

-- Fix 1: IRTC Critico → schema composite
UPDATE alert_rules
SET condition = '{
  "type": "composite",
  "logic": "AND",
  "clauses": [
    {"field": "irtc.score", "op": ">", "value": 75}
  ]
}'::jsonb,
    updated_at = now()
WHERE name = 'IRTC Crítico'
  AND domain = 'composto'
  AND (condition->>'type' IS NULL OR condition->>'type' <> 'composite');

-- Fix 2: Precipitacao Intensa → nome de campo correto
-- Observacao: esta regra e dominio 'clima' (nao 'composto'), entao e
-- avaliada por etl_alerts_engine.py, nao por etl_correlations.py. O fix
-- aqui e renomear o field pra casar com a coluna real.
UPDATE alert_rules
SET condition = jsonb_set(condition, '{field}', '"precipitation"'),
    updated_at = now()
WHERE name = 'Precipitação Intensa'
  AND domain = 'clima'
  AND condition->>'field' = 'precipitation_24h';
