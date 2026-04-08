-- Migration 014: Seed de regras compostas para Fase 3.A (fusao multi-dominio)
--
-- Essas regras NAO sao avaliadas pelo etl_alerts_engine.py (que so le condicoes
-- simples por dominio). Elas sao avaliadas por um ETL separado
-- (etl_correlations.py) que roda a cada hora e aplica logica booleana
-- composta sobre dados de multiplos dominios.
--
-- Os registros em alert_rules sao usados aqui apenas como ancora de referencia
-- para o campo rule_id das notifications geradas, de modo que o frontend
-- consegue mostrar "esta notificacao veio da regra X" e o operador pode
-- ajustar cooldowns/severidade via UI futuramente.
--
-- Campo `condition` usa JSONB com schema custom para regras compostas:
--   { "type": "composite",
--     "logic": "AND",
--     "clauses": [
--       {"field": "climate.temperature", "op": ">", "value": 32, "window_hours": 6},
--       {"field": "climate.humidity", "op": "<", "value": 40, "window_hours": 6},
--       {"field": "fire_spots.count", "op": ">=", "value": 3, "window_hours": 24}
--     ]
--   }
--
-- O etl_correlations.py le esse JSON e avalia em Python. Nao ha avaliacao no DB.

INSERT INTO alert_rules (name, description, domain, condition, severity, channels, cooldown_minutes) VALUES
(
  'Risco de Incendio Composto',
  'Temperatura alta + umidade baixa + focos de incendio recentes no mesmo municipio',
  'composto',
  '{
    "type": "composite",
    "logic": "AND",
    "clauses": [
      {"field": "climate.temperature", "op": ">", "value": 32, "window_hours": 6},
      {"field": "climate.humidity", "op": "<", "value": 40, "window_hours": 6},
      {"field": "fire_spots.count", "op": ">=", "value": 3, "window_hours": 24}
    ]
  }'::jsonb,
  'high',
  '{push,email}',
  120
),
(
  'Risco Hidrico Composto',
  'Rio em nivel de alerta + dengue com casos crescentes (correlacao enchente-arbovirose)',
  'composto',
  '{
    "type": "composite",
    "logic": "AND",
    "clauses": [
      {"field": "river.alert_level", "op": "in", "value": ["alert", "emergency"]},
      {"field": "dengue.alert_level", "op": ">=", "value": 2}
    ]
  }'::jsonb,
  'critical',
  '{push,email,telegram}',
  60
),
(
  'Estresse Climatico Composto',
  'IRTC critico + qualidade do ar degradada simultaneamente — sinal de crise multidominio',
  'composto',
  '{
    "type": "composite",
    "logic": "AND",
    "clauses": [
      {"field": "irtc.score", "op": ">", "value": 70},
      {"field": "air.aqi", "op": ">", "value": 100}
    ]
  }'::jsonb,
  'high',
  '{push,email}',
  180
)
ON CONFLICT DO NOTHING;
