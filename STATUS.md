# C2 Paraná — Status de Implementação

**Última atualização:** 2026-04-19
**Substitui:** `c2-parana-prompts/`, `c2-parana-fix-prompts/`, `c2-parana-fix-prompts-v2/`, `PLANO_IMPLEMENTACAO_C4ISR.md`, `PLANO_FASE3.md`, `PLANO_FASE4.md`, `PLANO_FASE5.md`, `PLANO_CORRECAO.md` (todos consolidados aqui)

Este é o **único documento ativo** de status. Planos antigos foram arquivados e removidos do repo. Atualize esta página a cada fechamento de fase.

---

## 1. Visão geral

O projeto começou como SaaS de 15 páginas (`c2-parana-prompts/`) e foi pivotado para um sistema **C4ISR** (Command, Control, Communications, Computers, Intelligence, Surveillance, Reconnaissance) em 26/03. Hoje tem 6 fases planejadas:

| Fase | Escopo | Status |
|---|---|---|
| 0 — Estabilização | ETLs core e crons | ✅ COMPLETO |
| 1 — COP | Mapa unificado, IRTC, sidebar municipal | ✅ COMPLETO |
| 2 — Alertas & Comunicações | Engine de regras + Realtime | 🟡 PARCIAL (SMS/Email/Push diferidos) |
| 3 — Inteligência & Predição | Correlações, anomalias, projeções | ✅ COMPLETO |
| 4 — OODA | Incidentes, playbooks, comando | ✅ COMPLETO |
| 5 — Reconhecimento & Sensores | CEMADEN, DataSUS, perfis municipais | 🟡 PARCIAL (5.B/C/G/H diferidos) |
| 6 — PWA, API, Interop | Offline, REST público, gov.br SSO | ❌ NÃO INICIADO |

---

## 2. Drift planejado vs. real

| Métrica | Plano OVERVIEW (15 pg SaaS) | Hoje | Variação |
|---|---|---|---|
| Páginas (`src/pages/`) | 15 | 26 | +73% |
| Componentes (`src/components/`) | ~40 | 75 | +88% |
| Hooks (`src/hooks/`) | 7 | 33 | +371% |
| Scripts ETL (`scripts/etl_*.py`) | 6 | 21 | +250% |
| Migrations (`supabase/migrations/`) | 3 | 28 | +833% |
| Workflows GitHub Actions | 7 | 23 | +229% |

A explosão de escopo é **intencional** (pivô C4ISR), não scope creep.

---

## 3. Status por fase

### Fase 0 — Estabilização ✅

Todos os 6 ETLs core estabilizados com fallback/retry:

| ETL | Script | Cron | Status |
|---|---|---|---|
| Clima (INMET + Open-Meteo fallback) | `etl_clima.py` | `cron-clima.yml` (1h) | ✅ |
| Saúde (InfoDengue) | `etl_saude.py` | `cron-saude.yml` (semanal) | ✅ |
| Ambiente (FIRMS + AQICN) | `etl_ambiente.py` | `cron-ambiente.yml` (12h) | ✅ |
| Agro (Datageo/SIDRA) | `etl_agro.py` | `cron-agro.yml` (semanal) | ✅ |
| Notícias (RSS) | `etl_noticias.py` | `cron-noticias.yml` (15min) | ✅ |
| Legislativo (ALEP) | `etl_legislativo.py` | `cron-legislativo.yml` (diário) | ✅ |

**Pendente:** dashboard dedicado de health de crons (hoje só via Actions logs).

### Fase 1 — Common Operating Picture ✅

- `MapPage.tsx` — heatmap multi-camadas (clima, fogo, dengue, rios, ar, IRTC)
- `irtc_scores` — 399 municípios cobertos (migration 011, `etl_irtc.py`)
- `IRTCLayer` — overlay gradiente
- `MunicipalityPopup` — perfil consolidado por município
- `TimeRangeCompare` — slider temporal (commit `f9177d7`)

**Diferido:** geofencing / áreas de interesse → Fase 6.

### Fase 2 — Alertas & Comunicações 🟡

| Item | Status | Evidência |
|---|---|---|
| Engine de regras de alerta | ✅ | `alert_rules` (mig 010) + `etl_alerts_engine.py` + 15 seeds (mig 012) |
| Supabase Realtime | ✅ | publication em `notifications` (mig 013); `useNotifications` |
| Centro de alertas (UI) | ✅ | `AlertasPage.tsx`, `NotificationPrefsPage.tsx` |
| Regras de escalonamento | ✅ | `escalation_rules` (mig 024) + `etl_incident_escalation.py` |
| Push notifications (PWA/FCM) | 🟡 esqueleto | Service Worker presente; FCM não plugado |
| SMS (Twilio/Vonage) | ❌ | adiado |
| Email digest (Resend) | ❌ | adiado |

### Fase 3 — Inteligência & Predição ✅

| Sub-fase | Status | Evidência |
|---|---|---|
| 3.A Regras compostas (3 correlações) | ✅ | `etl_correlations.py` — incêndio, enchente, epidemiológico |
| 3.B Detecção de anomalias | ✅ | `etl_anomalies.py` + `anomalies` (mig 018) |
| 3.C Projeções dengue | ✅ | `etl_dengue_projections.py` + `dengue_projections` (mig 019) |
| 3.D IRTC 399 municípios | ✅ | populated; bugs corrigidos (commits `becbe46`, `790e75b`) |
| 3.E Backtesting histórico | ⏸ bloqueado | dados históricos insuficientes (<6 meses) — H2/2026 |
| 3.F Relatórios situacionais | ✅ | `etl_situational_report.py` + `situational_reports` (mig 017) |
| 3.G Dashboard de tendências | ✅ | `TendenciasPage.tsx` |
| 3.H Dashboard analítico exec | 🟡 parcial | KPIs no `Dashboard.tsx`; deep analytics não construído |

### Fase 4 — OODA ✅

7/7 sub-fases entregues:

| Item | Status | Evidência |
|---|---|---|
| State machine OODA | ✅ | enum em `incidents` (mig 020) + triggers de validação |
| Playbooks (4 templates) | ✅ | `playbook_templates` (mig 023) — incêndio, enchente, surto, onda calor |
| UI de incidentes | ✅ | `IncidentesPage.tsx` + `IncidentDetailPage.tsx` (commits `62c4987`, `78159ca`) |
| Audit trail | ✅ | `incident_actions` (mig 025) + JSONB `audit_log` |
| Relatórios pós-incidente | ✅ | `incident_reports` (mig 025) |
| Dashboard comando | ✅ | `ComandoPage.tsx` |
| Roles (analyst/operator/commander) | ✅ | `profiles.role` (mig 022) + RLS por role |

### Fase 5 — Reconhecimento & Sensores 🟡

| Sub-fase | Status | Evidência |
|---|---|---|
| 5.A CEMADEN | ✅ | `etl_cemaden.py` + `cemaden_alerts` (mig 026/027); cron diário |
| 5.B Sentinel/Copernicus | ⏸ diferido | custo €50/mês + infra de tile cache não orçados |
| 5.C Google Earth Engine | ⏸ diferido | acoplado ao 5.B |
| 5.D Perfis municipais | ✅ | `ReconhecimentoPage.tsx` (commit `29809f6`); 8 indicadores + radar 90d |
| 5.E Comparação temporal | ✅ | `TimeRangeCompare.tsx` (commit `f9177d7`) |
| 5.F DataSUS SIH | ✅ | `etl_datasus.py` + `datasus_sih` (mig 028); cron mensal (dia 5) |
| 5.G DENATRAN | ❌ opcional | baixa prioridade |
| 5.H SICAR | ❌ opcional | baixa prioridade |

### Fase 6 — PWA, API, Interop ❌

Não iniciada. Itens previstos:
- Service Worker offline-first com sync IndexedDB
- OpenAPI 3.0 público
- Webhooks para parceiros (Defesa Civil/SISDEC)
- Export CSV/GeoJSON
- gov.br SSO

---

## 4. Auth & Paywall

| Item | Status | Notas |
|---|---|---|
| Auth email/senha + Google OAuth | ✅ | `AuthContext.tsx` |
| Trial 14 dias | ✅ reativado | trigger `on_profile_created` cria sub `trialing/pro` (mig 001) |
| Paywall 3 planos (solo/pro/enterprise) | ✅ reativado | commit `90eb2a9` (19/04) — `hasAccess`/`isPro` derivados da subscription real |
| `ProtectedRoute` no router | ✅ reativado | commit `90eb2a9` — envolve `Layout` |
| Edge function `create-checkout` | ⏸ não verificado | deploy/secrets Stripe não confirmados |
| Edge function `create-portal` | ⏸ não verificado | idem |
| Edge function `stripe-webhook` | ⏸ não verificado | idem |
| `src/lib/stripe.ts` (singleton `loadStripe`) | ❌ ausente | imports diretos espalhados |

**Usuário de teste provisionado:** `teste@teste.com` / `teste123456` — plano `enterprise/active` (script `scripts/seed_test_user.py`).

---

## 5. Inventário de migrations (28)

```
001 initial_schema           015 fix_composite_rules
002 rls_policies             016 irtc_coverage_columns
003 functions                017 situational_reports
004 fire_spots_unique        018 anomalies
005 air_quality_unique       019 dengue_projections
006 data_cache_rls_by_plan   020 incidents_schema
007 fix_constraints          021 alert_auto_incident
008 rls_allow_anon_read      022 user_roles
009 security_hardening       023 seed_playbooks
010 alert_rules              024 escalation_rules
011 irtc_scores              025 incident_reports
012 seed_alert_rules         026 cemaden_alerts
013 realtime_notifications   027 seed_cemaden_rules
014 composite_alert_rules    028 datasus_health
```

---

## 6. Edge Functions

| Função | Path | Deploy verificado? |
|---|---|---|
| create-checkout | `supabase/functions/create-checkout/` | ❌ |
| create-portal | `supabase/functions/create-portal/` | ❌ |
| stripe-webhook | `supabase/functions/stripe-webhook/` | ❌ |
| scrape-infohidro | `supabase/functions/scrape-infohidro/` | ❌ |

**Ação:** rodar `supabase functions list --project-ref fialxjcsgywvvuxjxcly` e `supabase secrets list`.

---

## 7. Itens em aberto

### 🔴 P0 — Crítico

| # | Item | Esforço | Status |
|---|---|---|---|
| 1 | Rotacionar `SUPABASE_SERVICE_ROLE_KEY`, `INFOHIDRO_USER/PASS`, `GETEC_USER/PASS` (estavam em `.env` commitado em 18/03) | 1-2h | ⏳ aguarda usuário (não verificável via código) |

### 🟠 P1 — Alta

| # | Item | Esforço | Status |
|---|---|---|---|
| 2 | Verificar deploy das 4 edge functions + secrets Stripe | 30min | ⏳ |
| 3 | Criar `src/lib/stripe.ts` singleton | 10min | ⏳ |
| 4 | E2E Playwright do fluxo paywall: signup → trial → checkout → webhook → acesso | 1 sessão | ⏳ |

### 🟡 P2 — Média

| # | Item | Esforço | Status |
|---|---|---|---|
| 5 | README real (hoje 13 bytes) | 30min | ⏳ |
| 6 | Smoke test CEMADEN + DataSUS em prod (próximo run mensal: 05/05) | 20min | ⏳ |
| 7 | Investigar pasta `reports/` vazia (Storage vs. local) | 1h | ⏳ |
| 8 | Push notifications: plugar Firebase FCM | 1 sessão | ⏳ |

### 🟢 P3 — Baixa / Diferido

- SMS (Twilio/Vonage) — Fase 2 backlog
- Email digest (Resend) — Fase 2 backlog
- Sentinel/Copernicus (5.B) + GEE (5.C) — orçamento €50/mês
- DENATRAN (5.G) e SICAR (5.H) — baixa prioridade
- Backtesting histórico (3.E) — esperar dados (>24 meses)
- Fase 6 completa (PWA offline, API pública, gov.br SSO)

---

## 8. Anti-drift — regras

1. **Um plano ativo só.** Quando uma fase fecha, atualize esta página e arquive notas em `docs/archive/`. Nada de criar novo `PLANO_*.md` na raiz.
2. **Nenhum `TODO: reativar` no main sem issue rastreando.** O paywall ficou desligado ~1 mês sem rastreamento — não repetir.
3. **Pre-commit bloqueando `.env`.** Já no `.gitignore`; considerar `git secrets` ou `detect-secrets` no hook.
4. **Atualizar este STATUS.md a cada fecho de fase.** É o único contrato vivo.

---

*Histórico de planos arquivado em `docs/archive/plans/` (commit que removeu os originais: ver `git log -- PLANO_FASE5.md`).*
