-- Migration 024: Escalation rules (Fase 4.E)
--
-- SLA-based auto-escalation for unattended incidents.
-- Critical: 15 min -> commander + SMS + email
-- High:     60 min -> commander + email
-- Medium:   4h     -> reminder to assignee
-- Low:      24h    -> email digest

CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  max_response_minutes INTEGER NOT NULL,
  escalate_to_role TEXT NOT NULL DEFAULT 'commander'
    CHECK (escalate_to_role IN ('viewer', 'operator', 'commander')),
  channels TEXT[] NOT NULL DEFAULT '{push}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_escalation_rules_severity ON escalation_rules(severity)
  WHERE is_active = true;

ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escalation_rules_read" ON escalation_rules FOR SELECT USING (true);
CREATE POLICY "escalation_rules_service_write" ON escalation_rules FOR ALL
  USING (auth.role() = 'service_role');

-- Seed: 4 regras default (uma por severidade)
INSERT INTO escalation_rules (severity, max_response_minutes, escalate_to_role, channels)
VALUES
  ('critical',   15, 'commander', ARRAY['push', 'email']),
  ('high',       60, 'commander', ARRAY['push', 'email']),
  ('medium',    240, 'operator',  ARRAY['push']),
  ('low',      1440, 'operator',  ARRAY['email']);

-- Controla quantas escalations ja foram feitas para um incidente (evita loop)
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMPTZ;

CREATE INDEX idx_incidents_escalation_pending
  ON incidents(severity, detected_at)
  WHERE status IN ('detected', 'observing')
    AND acknowledged_at IS NULL;
