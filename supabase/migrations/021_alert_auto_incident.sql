-- Migration 021: Flag para auto-criacao de incidentes em alert_rules (Fase 4.A)
--
-- Quando auto_create_incident=true e a regra dispara com severity >= high,
-- os ETLs (etl_correlations, etl_alerts_engine) criam um registro em incidents
-- automaticamente.

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS auto_create_incident BOOLEAN NOT NULL DEFAULT false;

-- Habilita auto-criacao para regras compostas (domain='composto') de alta severidade
UPDATE alert_rules
  SET auto_create_incident = true
  WHERE domain = 'composto'
    AND severity IN ('critical', 'high');
