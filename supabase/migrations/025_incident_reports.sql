-- Migration 025: Incident reports (Fase 4.G)
--
-- Auto-generated post-incident reports for retrospective analysis.
-- Created when an incident is closed, capturing a snapshot of the entire
-- lifecycle: timeline, metrics, playbook compliance, lessons learned.

CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  summary JSONB NOT NULL DEFAULT '{}',
  timeline JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '{}',
  playbook_compliance NUMERIC,
  lessons_learned TEXT,
  context_snapshot JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT now(),
  finalized_by UUID REFERENCES auth.users(id),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX idx_incident_reports_incident ON incident_reports(incident_id);
CREATE INDEX idx_incident_reports_generated ON incident_reports(generated_at DESC);

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incident_reports_read" ON incident_reports FOR SELECT USING (true);
CREATE POLICY "incident_reports_auth_write" ON incident_reports FOR ALL
  USING (auth.role() IN ('service_role', 'authenticated'));
