-- Migration 027: Seed de regras de alerta CEMADEN (Fase 5.A)
--
-- Regras que disparam sobre insercoes em cemaden_alerts.
-- Avaliadas por etl_alerts_engine.py / etl_correlations.py como dominio='cemaden'.

INSERT INTO alert_rules (name, description, domain, condition, severity, channels, cooldown_minutes, auto_create_incident, is_active)
VALUES
  (
    'CEMADEN Alerta Maximo',
    'CEMADEN emitiu alerta maximo (risco iminente) para algum municipio do PR',
    'cemaden',
    '{"type": "simple", "field": "severity", "op": "=", "value": "alerta_maximo"}'::jsonb,
    'critical',
    ARRAY['push','email'],
    30,
    true,
    true
  ),
  (
    'CEMADEN Alerta',
    'CEMADEN emitiu alerta (risco alto) para algum municipio do PR',
    'cemaden',
    '{"type": "simple", "field": "severity", "op": "=", "value": "alerta"}'::jsonb,
    'high',
    ARRAY['push'],
    60,
    true,
    true
  ),
  (
    'CEMADEN Atencao',
    'CEMADEN emitiu nivel atencao (risco em evolucao) para algum municipio do PR',
    'cemaden',
    '{"type": "simple", "field": "severity", "op": "=", "value": "atencao"}'::jsonb,
    'medium',
    ARRAY['push'],
    120,
    false,
    true
  )
ON CONFLICT DO NOTHING;
