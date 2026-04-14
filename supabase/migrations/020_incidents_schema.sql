-- Migration 020: Incidents, incident_actions, playbooks (Fase 4.A)
--
-- Core schema for OODA decision workflow: incident lifecycle tracking,
-- audit trail via incident_actions, and playbook templates.

-- ============================================================
-- TABELA: playbooks
-- Templates de resposta a incidentes, com steps ordenados.
-- ============================================================
CREATE TABLE IF NOT EXISTS playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  incident_type TEXT NOT NULL,
  severity_min TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity_min IN ('critical', 'high', 'medium', 'low')),
  steps JSONB NOT NULL DEFAULT '[]',
  estimated_duration_minutes INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_playbooks_type ON playbooks(incident_type) WHERE is_active = true;

ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playbooks_read" ON playbooks FOR SELECT USING (true);
CREATE POLICY "playbooks_service_write" ON playbooks FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: incidents
-- Ciclo de vida OODA: detected -> observing -> orienting ->
-- deciding -> acting -> monitoring -> resolved -> closed
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'incendio', 'enchente', 'surto', 'seca',
    'qualidade_ar', 'onda_calor', 'deslizamento', 'outro'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected', 'observing', 'orienting', 'deciding',
    'acting', 'monitoring', 'resolved', 'closed'
  )),
  ooda_phase TEXT GENERATED ALWAYS AS (
    CASE status
      WHEN 'detected'   THEN 'observe'
      WHEN 'observing'  THEN 'observe'
      WHEN 'orienting'  THEN 'orient'
      WHEN 'deciding'   THEN 'decide'
      WHEN 'acting'     THEN 'act'
      WHEN 'monitoring' THEN 'act'
      WHEN 'resolved'   THEN 'act'
      WHEN 'closed'     THEN 'act'
    END
  ) STORED,
  affected_municipalities JSONB DEFAULT '[]',
  affected_population INTEGER,
  source_alert_id UUID REFERENCES alert_rules(id),
  source_notification_id UUID REFERENCES notifications(id),
  playbook_id UUID REFERENCES playbooks(id),
  assigned_to UUID REFERENCES auth.users(id),
  context JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity);
CREATE INDEX idx_incidents_type ON incidents(type);
CREATE INDEX idx_incidents_detected_at ON incidents(detected_at DESC);
CREATE INDEX idx_incidents_assigned ON incidents(assigned_to) WHERE status NOT IN ('resolved', 'closed');

-- Previne incidentes duplicados para o mesmo alerta enquanto nao resolvido
CREATE UNIQUE INDEX idx_incidents_dedup
  ON incidents(type, source_alert_id)
  WHERE status NOT IN ('resolved', 'closed');

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents_read" ON incidents FOR SELECT USING (true);
CREATE POLICY "incidents_service_write" ON incidents FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "incidents_auth_update" ON incidents FOR UPDATE
  USING (auth.role() IN ('service_role', 'authenticated'));

ALTER PUBLICATION supabase_realtime ADD TABLE incidents;

-- ============================================================
-- TABELA: incident_actions
-- Audit trail: cada acao tomada durante o ciclo de vida.
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'status_change', 'assignment', 'note', 'playbook_step',
    'escalation', 'notification_sent', 'external_contact',
    'resolution', 'reopen'
  )),
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_actions_incident ON incident_actions(incident_id, performed_at DESC);
CREATE INDEX idx_incident_actions_type ON incident_actions(action_type);

ALTER TABLE incident_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incident_actions_read" ON incident_actions FOR SELECT USING (true);
CREATE POLICY "incident_actions_service_write" ON incident_actions FOR INSERT
  WITH CHECK (auth.role() IN ('service_role', 'authenticated'));

-- ============================================================
-- Trigger: atualiza updated_at em incidents a cada UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION update_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_incidents_updated_at();

-- ============================================================
-- Trigger: auto-preenche timestamps de lifecycle
-- ============================================================
CREATE OR REPLACE FUNCTION update_incident_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'detected' AND NEW.status != 'detected' AND NEW.acknowledged_at IS NULL THEN
    NEW.acknowledged_at = now();
  END IF;
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = now();
  END IF;
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incident_lifecycle
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_incident_lifecycle();
