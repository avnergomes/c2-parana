# Plano de Implementação — Fase 4 (Workflow de Decisão OODA)

**Versão:** 1.6
**Data:** 2026-04-13 (atualizado apos sessao 13/abr)
**Status:** ✅ **FASE 4 COMPLETA — 7/7 sub-fases shipadas em uma unica sessao**
**Predecessor:** `PLANO_FASE3.md` (7/8 sub-fases completas)

---

## 1. Contexto

A Fase 3 (Intelligence) entregou fusão de dados cross-domínio, detecção de
anomalias, projeções de dengue e relatórios situacionais automáticos. O sistema
agora **sabe** quando algo está errado. O que falta é a capacidade de **agir**
de forma estruturada.

A Fase 4 implementa o C2 (Command & Control) do C4ISR: o ciclo OODA
(Observe-Orient-Decide-Act) que transforma inteligência em resposta coordenada.

**Antes (Fase 3):**
> Correlação detecta risco composto de incêndio em Londrina.
> Notificação push enviada. Operador lê e... faz o quê?

**Depois (Fase 4):**
> Correlação detecta risco composto de incêndio em Londrina.
> → Incidente criado automaticamente (OBSERVE)
> → Sistema contextualiza: 3 dias sem chuva, umidade 28%, 7 focos FIRMS,
>   IRTC=72, populacao afetada 580k (ORIENT)
> → Playbook "Incêndio Florestal" sugerido com 5 ações priorizadas (DECIDE)
> → Operador executa/adapta ações, cada uma registrada com timestamp (ACT)
> → Incidente monitorado até resolução, relatório pós-incidente gerado

---

## 2. O que já existe (ponto de partida)

Descoberto via exploração do schema e codebase em 2026-04-13:

| Recurso | Estado | Relevância para Fase 4 |
|---|---|---|
| `alert_rules` + `notifications` | ✅ | Fonte de OBSERVE: alertas disparam incidentes |
| `etl_correlations.py` | ✅ | 3 regras compostas que podem auto-criar incidentes |
| `etl_alerts_engine.py` | ✅ | Motor de regras simples por domínio |
| `irtc_scores` (399 munis) | ✅ | Severidade do incidente derivada do IRTC |
| `situational_reports` | ✅ | Base para contextualização (ORIENT) |
| `anomalies` | ✅ | Outra fonte de OBSERVE |
| `dengue_projections` | ✅ | Input para playbooks epidemiológicos |
| Supabase Realtime | ✅ | Já funcional para notifications; reusar para incidentes |
| Supabase Auth + RLS | ✅ | Roles existem; precisam de role "operador" e "comandante" |
| React Query (TanStack) | ✅ | Pattern de hooks já estabelecido |
| Recharts + Leaflet | ✅ | Visualização de timeline e mapa de incidentes |
| Zod | ✅ | Validação de playbooks e ações |

### Gaps específicos para Fase 4

1. **Sem tabela `incidents`** -- não há tracking de lifecycle de eventos
2. **Sem tabela `playbooks`** -- sem templates de resposta
3. **Sem audit trail** -- ações não são registradas com who/what/when
4. **Sem state machine** -- nenhuma lib de workflow (XState, etc.)
5. **Sem roles granulares** -- não há distinção operador/comandante/analista
6. **Sem escalation temporal** -- alertas não escalam se não atendidos

---

## 3. Decisões arquiteturais

### 3.1 State machine: PostgreSQL nativo vs XState

**Decisão: PostgreSQL nativo com enums + triggers + RLS.**

Razão: o workflow OODA é linear (4 fases) com poucos branches. XState adicionaria
~40KB ao bundle e complexidade de sync DB↔client. O estado vive no PostgreSQL
(source of truth), e o frontend apenas reflete. Triggers garantem transições
válidas server-side.

```
DETECTED → OBSERVING → ORIENTING → DECIDING → ACTING → MONITORING → RESOLVED → CLOSED
              ↑                                            |
              └────────────── (reescalation) ──────────────┘
```

### 3.2 Audit trail: JSONB array vs tabela separada

**Decisão: tabela separada `incident_actions`.**

Razão: JSONB array dentro de `incidents` não é queryável para relatórios
agregados ("quantas ações tipo X foram tomadas no último mês?"). Tabela separada
permite índices, RLS por ação, e queries analíticas.

### 3.3 Auto-criação de incidentes

**Decisão: opt-in por regra.**

Nem toda notificação deve virar incidente. Campo `auto_create_incident` em
`alert_rules` e `composite_alert_rules` controla quais regras criam incidentes
automaticamente. Default: apenas severity critical e high.

### 3.4 Roles

**Decisão: campo `role` em `profiles` com 3 níveis.**

- `viewer` -- leitura apenas (plano free)
- `operator` -- pode criar/atualizar incidentes, executar ações
- `commander` -- pode aprovar playbooks, fechar incidentes, ver audit completo

RLS policies derivam permissões do role.

---

## 4. Decomposição em sub-fases

Cada sub-fase é shippable sozinha e entrega valor incremental.

### Fase 4.A -- Schema de incidentes + auto-criação ✅ Concluída (2026-04-13)

**Objetivo:** Criar as tabelas core e conectar ao pipeline de alertas existente.

**Escopo:**
- Migration 020: tabelas `incidents`, `incident_actions`, `playbooks`,
  `playbook_steps`
- Migration 021: ALTER `alert_rules` ADD `auto_create_incident BOOLEAN DEFAULT false`
- Migration 022: ALTER `profiles` ADD `role TEXT DEFAULT 'viewer'`
- Seed: 4 playbooks pré-configurados (incêndio, enchente, surto, onda de calor)
- Patch em `etl_correlations.py` e `etl_alerts_engine.py`: quando
  `auto_create_incident=true` e severity >= high, INSERT em `incidents`
- RLS policies para incidents (viewer=read, operator=read+write, commander=all)

**Schema `incidents`:**
```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'incendio', 'enchente', 'surto', 'seca',
    'qualidade_ar', 'onda_calor', 'deslizamento', 'outro'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected','observing','orienting','deciding',
    'acting','monitoring','resolved','closed'
  )),
  ooda_phase TEXT GENERATED ALWAYS AS (
    CASE status
      WHEN 'detected' THEN 'observe'
      WHEN 'observing' THEN 'observe'
      WHEN 'orienting' THEN 'orient'
      WHEN 'deciding' THEN 'decide'
      WHEN 'acting' THEN 'act'
      WHEN 'monitoring' THEN 'act'
      WHEN 'resolved' THEN 'act'
      WHEN 'closed' THEN 'act'
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
```

**Schema `incident_actions`:**
```sql
CREATE TABLE incident_actions (
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
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_actions_incident ON incident_actions(incident_id);
CREATE INDEX idx_incident_actions_type ON incident_actions(action_type);
```

**Schema `playbooks`:**
```sql
CREATE TABLE playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  incident_type TEXT NOT NULL,
  severity_min TEXT NOT NULL DEFAULT 'medium',
  steps JSONB NOT NULL DEFAULT '[]',
  estimated_duration_minutes INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Playbook `steps` JSONB structure:**
```json
[
  {
    "order": 1,
    "title": "Verificar condições meteorológicas atuais",
    "description": "Consultar dados INMET do município afetado",
    "responsible_role": "operator",
    "estimated_minutes": 5,
    "is_critical": true
  },
  {
    "order": 2,
    "title": "Notificar Corpo de Bombeiros",
    "description": "Contato via canal de emergência",
    "responsible_role": "commander",
    "estimated_minutes": 10,
    "is_critical": true
  }
]
```

**Seed: 4 playbooks pré-configurados:**

1. **Incêndio Florestal** (6 passos): verificar meteo → confirmar focos FIRMS →
   notificar Bombeiros → monitorar propagação → avaliar qualidade do ar → atualizar COP
2. **Risco de Enchente** (6 passos): verificar previsão chuva → checar nível rios →
   notificar Defesa Civil → avaliar evacuação → monitorar nível → atualizar COP
3. **Surto Epidemiológico** (5 passos): verificar vizinhos → validar dados InfoDengue →
   notificar Sec. Saúde → monitorar evolução semanal → recomendar controle vetorial
4. **Onda de Calor** (5 passos): verificar duração prevista → avaliar impacto agro →
   notificar Saúde → alertar Agricultura → monitorar

**Arquivos a criar:**
- `supabase/migrations/020_incidents_schema.sql` (~120 linhas)
- `supabase/migrations/021_alert_auto_incident.sql` (~10 linhas)
- `supabase/migrations/022_user_roles.sql` (~15 linhas)
- `supabase/migrations/023_seed_playbooks.sql` (~80 linhas)

**Arquivos a modificar:**
- `scripts/etl_correlations.py` -- adicionar auto-criação de incident
- `scripts/etl_alerts_engine.py` -- adicionar auto-criação de incident

**Validação:** query `SELECT count(*) FROM incidents` após primeiro run dos ETLs
com regras auto_create_incident=true habilitadas.

---

### Fase 4.B -- API de incidentes + hooks React ✅ Concluída (2026-04-13)

**Objetivo:** Expor CRUD de incidentes via Supabase client e criar hooks reutilizáveis.

**Escopo:**
- Hook `useIncidents.ts` -- lista, filtra, pagina incidentes
- Hook `useIncident.ts` -- detalhe de um incidente + actions + realtime
- Hook `useIncidentActions.ts` -- registrar ações (status change, notes, steps)
- Hook `usePlaybooks.ts` -- listar playbooks, associar a incidente
- Hook `useIncidentsRealtime.ts` -- Supabase Realtime subscription para novos incidentes
- Validação Zod para mutations (criar incidente, registrar ação, mudar status)
- Transições de status validadas client-side (mirror do CHECK constraint):
  detected → observing → orienting → deciding → acting → monitoring → resolved → closed

**Transições válidas (diagrama):**
```
detected ──→ observing ──→ orienting ──→ deciding ──→ acting ──→ monitoring
                                                                     │
                                                         ┌───────────┤
                                                         ↓           ↓
                                                      resolved ──→ closed
                                                         ↑
                                              (reescalar)│
                                              monitoring ┘
```

**Arquivos a criar:**
- `src/hooks/useIncidents.ts` (~80 linhas)
- `src/hooks/useIncident.ts` (~60 linhas)
- `src/hooks/useIncidentActions.ts` (~50 linhas)
- `src/hooks/usePlaybooks.ts` (~40 linhas)
- `src/hooks/useIncidentsRealtime.ts` (~30 linhas)
- `src/types/incident.ts` (~60 linhas, tipos + Zod schemas)

**Arquivos a modificar:**
- Nenhum (aditivo puro)

---

### Fase 4.C -- Página de gestão de incidentes ✅ Concluída (2026-04-13)

**Objetivo:** Interface principal para operadores gerenciarem o ciclo de vida de incidentes.

**Escopo:**
- Página `/incidentes` com lista filtrada por status/severity/type
- Kanban view: colunas por fase OODA (Observe | Orient | Decide | Act)
- Card de incidente com: título, tipo (ícone), severidade (cor), município,
  tempo desde detecção, assignee
- Filtros: status, severidade, tipo, município, período
- Contadores por fase no header (badges)
- Ação rápida: mudar status via drag-and-drop entre colunas (ou botão)
- Realtime: novos incidentes aparecem automaticamente via subscription

**Componentes:**
- `IncidentesPage.tsx` -- página principal com Kanban
- `IncidentKanban.tsx` -- grid de colunas OODA
- `IncidentCard.tsx` -- card compacto na coluna
- `IncidentFilters.tsx` -- barra de filtros
- `IncidentStatusBadge.tsx` -- badge colorido por status
- `IncidentSeverityIcon.tsx` -- ícone por severidade

**Cores por severidade (Tailwind):**
- Critical: `bg-red-100 border-red-500 text-red-800`
- High: `bg-orange-100 border-orange-500 text-orange-800`
- Medium: `bg-yellow-100 border-yellow-500 text-yellow-800`
- Low: `bg-blue-100 border-blue-500 text-blue-800`

**Ícones por tipo (Lucide):**
- incendio: `Flame`
- enchente: `CloudRain`
- surto: `Bug`
- seca: `Sun`
- qualidade_ar: `Wind`
- onda_calor: `Thermometer`
- deslizamento: `Mountain`
- outro: `AlertTriangle`

**Arquivos a criar:**
- `src/pages/IncidentesPage.tsx` (~200 linhas)
- `src/components/incidents/IncidentKanban.tsx` (~120 linhas)
- `src/components/incidents/IncidentCard.tsx` (~80 linhas)
- `src/components/incidents/IncidentFilters.tsx` (~60 linhas)
- `src/components/incidents/IncidentStatusBadge.tsx` (~30 linhas)
- `src/components/incidents/IncidentSeverityIcon.tsx` (~30 linhas)

**Arquivos a modificar:**
- `src/router/index.tsx` -- adicionar rota `/incidentes`
- `src/components/Layout.tsx` (ou Sidebar) -- adicionar nav item "Incidentes"

---

### Fase 4.D -- Detalhe do incidente + timeline + playbook ✅ Concluída (2026-04-13)

**Objetivo:** Página de detalhe com contexto completo, timeline de ações e
execução de playbook passo a passo.

**Escopo:**
- Página `/incidentes/:id` com layout em 2 colunas:
  - **Coluna esquerda (60%):** contexto do incidente
    - Header: título, tipo, severidade, fase OODA atual, tempo decorrido
    - Seção ORIENT: dados contextuais automáticos (IRTC do município,
      clima atual, alertas ativos, projeções de dengue se aplicável)
    - Mapa mini com município(s) afetado(s) highlighted
    - Playbook associado com checklist de passos (marcar como concluído)
  - **Coluna direita (40%):** timeline de ações
    - Lista cronológica reversa de todas as `incident_actions`
    - Cada ação: tipo (ícone), descrição, quem, quando
    - Formulário para adicionar nota/ação
    - Botão de transição de status (próxima fase OODA)

- Contextualização automática (ORIENT):
  - Buscar IRTC atual dos municípios afetados
  - Buscar clima atual (temperatura, umidade, precipitação)
  - Buscar alertas ativos na região
  - Buscar projeções de dengue se tipo=surto
  - Buscar nível dos rios se tipo=enchente
  - Exibir como cards informativos compactos

- Execução de playbook:
  - Playbook sugerido baseado no `incident_type` + `severity`
  - Operador pode aceitar ou escolher outro
  - Cada step tem checkbox + campo de notas
  - Steps críticos exigem confirmação antes de avançar
  - Progresso visual (barra de progresso)

**Componentes:**
- `IncidentDetailPage.tsx` -- layout 2 colunas
- `IncidentContext.tsx` -- dados ORIENT automáticos
- `IncidentTimeline.tsx` -- timeline de ações
- `IncidentPlaybookExec.tsx` -- execução de playbook step-by-step
- `IncidentMiniMap.tsx` -- mapa com municípios afetados
- `IncidentStatusStepper.tsx` -- stepper OODA (observe→orient→decide→act)
- `AddActionForm.tsx` -- formulário para registrar ação/nota

**Arquivos a criar:**
- `src/pages/IncidentDetailPage.tsx` (~250 linhas)
- `src/components/incidents/IncidentContext.tsx` (~150 linhas)
- `src/components/incidents/IncidentTimeline.tsx` (~100 linhas)
- `src/components/incidents/IncidentPlaybookExec.tsx` (~120 linhas)
- `src/components/incidents/IncidentMiniMap.tsx` (~60 linhas)
- `src/components/incidents/IncidentStatusStepper.tsx` (~80 linhas)
- `src/components/incidents/AddActionForm.tsx` (~60 linhas)

**Arquivos a modificar:**
- `src/router/index.tsx` -- adicionar rota `/incidentes/:id`

---

### Fase 4.E -- Escalation automático + notificações ✅ Concluída (2026-04-13)

**Objetivo:** Incidentes não atendidos escalam automaticamente baseado em SLA temporal.

**Escopo:**
- Script `etl_incident_escalation.py` (roda a cada 15 min via cron):
  - Busca incidentes com status != resolved/closed
  - Aplica regras de SLA:
    - Critical: sem ação em 15 min → escalar para commander + SMS
    - High: sem ação em 60 min → escalar para commander + email
    - Medium: sem ação em 4h → notificação push ao assignee
    - Low: sem ação em 24h → notificação email digest
  - Registra escalation como `incident_action` (tipo 'escalation')
  - Muda assignee se necessário (operador → commander)

- Notificações de incidente via Supabase Realtime:
  - Novo incidente criado → push para operadores de plantão
  - Incidente escalado → push + email para commander
  - Incidente resolvido → email digest para stakeholders

- Migration 024: tabela `escalation_rules` (configurável)

**Schema `escalation_rules`:**
```sql
CREATE TABLE escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL,
  max_response_minutes INTEGER NOT NULL,
  escalate_to_role TEXT NOT NULL DEFAULT 'commander',
  channels TEXT[] NOT NULL DEFAULT '{push}',
  is_active BOOLEAN DEFAULT true
);
```

**Seed (4 regras, uma por severidade):**
| Severity | SLA | Escala para | Canais |
|---|---|---|---|
| critical | 15 min | commander | push, sms, email |
| high | 60 min | commander | push, email |
| medium | 240 min | operator (reminder) | push |
| low | 1440 min (24h) | — | email |

**Arquivos a criar:**
- `scripts/etl_incident_escalation.py` (~150 linhas)
- `.github/workflows/cron-escalation.yml` (~40 linhas)
- `supabase/migrations/024_escalation_rules.sql` (~30 linhas)

**Arquivos a modificar:**
- Nenhum (aditivo puro)

---

### Fase 4.F -- Dashboard executivo (visão do comandante) ✅ Concluída (2026-04-13)

**Objetivo:** Visão consolidada para o comandante com KPIs operacionais,
incidentes ativos e métricas de resposta.

**Escopo:**
- Página `/comando` com layout de dashboard executivo:
  - **KPIs no topo (4 cards):**
    - Incidentes ativos (total + por severidade)
    - Tempo médio de resposta (últimas 24h)
    - SLA compliance % (respostas dentro do SLA)
    - Municípios em risco alto (IRTC > 60)
  - **Seção central:**
    - Lista dos 5 incidentes mais urgentes (por severidade + tempo sem ação)
    - Mapa do PR com incidentes ativos plotados (ícones por tipo)
  - **Seção inferior:**
    - Gráfico de incidentes por tipo (últimos 30 dias, BarChart)
    - Gráfico de tempo de resolução por severidade (BoxPlot ou BarChart)
    - Relatório situacional mais recente (resumo executivo)

- Hook `useCommandDashboard.ts`:
  - Agrega dados de incidents, irtc_scores, situational_reports
  - Calcula KPIs: avg response time, SLA compliance, open incidents by severity
  - Refresh automático a cada 60s

**Componentes:**
- `ComandoPage.tsx` -- layout do dashboard
- `CommandKPICards.tsx` -- 4 KPI cards no topo
- `UrgentIncidentsList.tsx` -- top 5 incidentes urgentes
- `IncidentMapOverlay.tsx` -- incidentes no mapa do PR
- `IncidentMetricsCharts.tsx` -- gráficos de métricas

**Arquivos a criar:**
- `src/pages/ComandoPage.tsx` (~200 linhas)
- `src/components/command/CommandKPICards.tsx` (~80 linhas)
- `src/components/command/UrgentIncidentsList.tsx` (~60 linhas)
- `src/components/command/IncidentMapOverlay.tsx` (~80 linhas)
- `src/components/command/IncidentMetricsCharts.tsx` (~100 linhas)
- `src/hooks/useCommandDashboard.ts` (~100 linhas)

**Arquivos a modificar:**
- `src/router/index.tsx` -- adicionar rota `/comando`
- `src/components/Layout.tsx` (ou Sidebar) -- adicionar nav item "Comando"
  (visível apenas para role commander)

---

### Fase 4.G -- Relatórios pós-incidente ✅ Concluída (2026-04-13)

**Objetivo:** Geração automática de relatório estruturado ao fechar um incidente,
para análise retrospectiva e aprendizado institucional.

**Escopo:**
- Migration 025: tabela `incident_reports`
- Geração automática quando status muda para 'closed':
  - Resumo: tipo, severidade, duração total, municípios afetados
  - Timeline: todas as ações em ordem cronológica
  - Métricas: tempo de resposta, tempo de resolução, ações tomadas
  - Playbook compliance: % dos steps do playbook executados
  - Lições aprendidas: campo de texto livre preenchido pelo commander
  - Dados contextuais no momento do incidente (snapshot de IRTC, clima, etc.)

- Frontend: seção em `/incidentes/:id` que aparece quando status=closed
- Exportação como PDF (via browser print ou react-pdf)

**Schema `incident_reports`:**
```sql
CREATE TABLE incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL UNIQUE REFERENCES incidents(id),
  summary JSONB NOT NULL,
  timeline JSONB NOT NULL,
  metrics JSONB NOT NULL,
  playbook_compliance NUMERIC,
  lessons_learned TEXT,
  context_snapshot JSONB,
  generated_at TIMESTAMPTZ DEFAULT now(),
  finalized_by UUID REFERENCES auth.users(id),
  finalized_at TIMESTAMPTZ
);
```

**Arquivos a criar:**
- `supabase/migrations/025_incident_reports.sql` (~25 linhas)
- `src/components/incidents/IncidentReport.tsx` (~150 linhas)
- `src/hooks/useIncidentReport.ts` (~50 linhas)

**Arquivos a modificar:**
- `src/pages/IncidentDetailPage.tsx` -- adicionar seção de relatório pós-incidente

---

## 5. Ordem de execução recomendada

1. ~~**4.A** -- Schema + auto-criação (backend first, sem frontend)~~ ✅ shipada 2026-04-13
2. ~~**4.B** -- Hooks React (foundation para todas as telas)~~ ✅ shipada 2026-04-13
3. ~~**4.C** -- Página de gestão (Kanban, lista de incidentes)~~ ✅ shipada 2026-04-13
4. ~~**4.D** -- Detalhe do incidente (timeline, playbook, contexto ORIENT)~~ ✅ shipada 2026-04-13
5. ~~**4.E** -- Escalation automático (ETL cron)~~ ✅ shipada 2026-04-13
6. ~~**4.F** -- Dashboard executivo (depende de dados de incidentes existindo)~~ ✅ shipada 2026-04-13
7. ~~**4.G** -- Relatórios pós-incidente (depende de lifecycle completo)~~ ✅ shipada 2026-04-13

Sub-fases 4.A+4.B podem ser feitas em uma sessão. 4.C+4.D em outra.
4.E é independente do frontend. 4.F e 4.G dependem de ter incidentes reais.

---

## 6. Métricas de sucesso por sub-fase

| Sub-fase | KPI | Meta |
|---|---|---|
| 4.A | Incidentes auto-criados por correlação | >= 1 por dia em condições de risco |
| 4.A | Seed playbooks carregados | 4 playbooks ativos |
| 4.B | Hooks funcionais com tipos | 5 hooks, 0 erros TypeScript |
| 4.C | Kanban renderiza incidentes | < 2s de carregamento |
| 4.D | Contextualização automática (ORIENT) | 4+ fontes de dados no detalhe |
| 4.D | Playbook associável a incidente | 100% dos tipos cobertos |
| 4.E | Escalation dispara dentro do SLA | > 95% dos incidentes critical escalados em 15 min |
| 4.F | Dashboard com KPIs reais | 4 KPIs computados corretamente |
| 4.G | Relatório gerado ao fechar | 100% dos incidentes closed têm report |

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Auto-criação de incidentes gera excesso | Alta | Médio | Cooldown por regra + deduplicate por município+tipo nas últimas 24h |
| Sem usuários reais para testar roles | Média | Alto | Seed 3 usuários de teste (viewer, operator, commander) |
| Playbooks genéricos demais | Média | Médio | Iterar com feedback de operador real; steps editáveis |
| Escalation spamma commander | Média | Médio | Max 3 escalations por incidente; snooze de 1h |
| Complexidade da página de detalhe | Alta | Médio | Layout 2 colunas; lazy-load seções; skeleton loading |
| RLS policies complexas | Média | Alto | Testar cada role com client separado; policy unit tests |

---

## 8. Dependências externas

| Dependência | Status | Bloqueante? |
|---|---|---|
| Supabase RLS (row-level security) | ✅ Já configurado | Não |
| Supabase Realtime | ✅ Já funcional | Não |
| Lucide icons (Flame, CloudRain, Bug, etc.) | ✅ Já instalado | Não |
| Recharts (gráficos de métricas) | ✅ Já instalado | Não |
| Leaflet (mapa de incidentes) | ✅ Já instalado | Não |
| react-pdf ou @react-pdf/renderer | ❌ Não instalado | Apenas 4.G (opcional, pode usar browser print) |
| XState ou state machine lib | ❌ Decidido não usar | N/A |

**Zero dependências novas necessárias** para sub-fases 4.A a 4.F.

---

## 9. Estimativa de esforço

| Sub-fase | Sessões estimadas | Complexidade |
|---|---|---|
| 4.A | 1 sessão | Média (migrations + ETL patch) |
| 4.B | 1 sessão | Baixa (hooks follow pattern existente) |
| 4.C | 1-2 sessões | Média-Alta (Kanban UI) |
| 4.D | 2 sessões | Alta (contexto + timeline + playbook) |
| 4.E | 1 sessão | Média (ETL cron) |
| 4.F | 1-2 sessões | Média (dashboard + KPIs) |
| 4.G | 1 sessão | Baixa (relatório + migration) |
| **Total** | **8-10 sessões** | |

---

*Este documento é vivo. Será atualizado conforme sub-fases forem executadas.*
*Próximo passo: iniciar 4.A (schema de incidentes).*
