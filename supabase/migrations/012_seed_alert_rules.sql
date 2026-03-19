-- Migration 012: Seed default alert rules
-- 9 regras pré-configuradas cobrindo todos os domínios

INSERT INTO alert_rules (name, description, domain, condition, severity, channels, cooldown_minutes) VALUES
(
  'Temperatura Extrema Alta',
  'Temperatura acima de 40°C em qualquer estação',
  'clima',
  '{"field": "temperature", "operator": ">", "threshold": 40}',
  'high',
  '{push,email}',
  120
),
(
  'Temperatura Extrema Baixa',
  'Temperatura abaixo de 0°C (geada)',
  'clima',
  '{"field": "temperature", "operator": "<", "threshold": 0}',
  'high',
  '{push,email}',
  120
),
(
  'Precipitação Intensa',
  'Precipitação acumulada > 100mm em 24h',
  'clima',
  '{"field": "precipitation_24h", "operator": ">", "threshold": 100}',
  'critical',
  '{push,telegram,email}',
  60
),
(
  'Nível Rio Alerta',
  'Estação fluviométrica em nível de alerta',
  'hidro',
  '{"field": "alert_level", "operator": "=", "threshold": "alert"}',
  'critical',
  '{push,telegram,email}',
  30
),
(
  'Nível Rio Atenção',
  'Estação fluviométrica em nível de atenção',
  'hidro',
  '{"field": "alert_level", "operator": "=", "threshold": "attention"}',
  'medium',
  '{push}',
  120
),
(
  'Dengue Epidemia',
  'Município com alerta nível 3 (epidemia) no InfoDengue',
  'saude',
  '{"field": "alert_level", "operator": ">=", "threshold": 3}',
  'high',
  '{push,email}',
  1440
),
(
  'Focos de Incêndio Concentrados',
  'Mais de 50 focos de calor em 24h no estado',
  'ambiente',
  '{"field": "fire_spots_24h", "operator": ">", "threshold": 50}',
  'high',
  '{push,email}',
  360
),
(
  'Qualidade do Ar Ruim',
  'AQI acima de 150 (insalubre para grupos sensíveis)',
  'ar',
  '{"field": "aqi", "operator": ">", "threshold": 150}',
  'medium',
  '{push}',
  360
),
(
  'IRTC Crítico',
  'Município com IRTC acima de 75 (risco crítico)',
  'composto',
  '{"field": "irtc_score", "operator": ">", "threshold": 75}',
  'critical',
  '{push,email}',
  360
)
ON CONFLICT DO NOTHING;
