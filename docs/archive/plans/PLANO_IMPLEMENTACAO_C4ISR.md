# Plano de Implementação C4ISR — C2 Paraná

**Versão:** 1.0
**Data:** 18 de março de 2026
**Status:** Aguardando aprovação

---

## 1. Diagnóstico: Estado Atual vs. C4ISR Completo

### O que o C2 Paraná já possui (mapeamento para C4ISR)

| Componente C4ISR | Status Atual | Cobertura |
|---|---|---|
| **C — Command** | Dashboard com KPIs e alertas | ~30% |
| **C — Control** | Sem workflow de decisão ou ações | ~10% |
| **C — Communications** | Sem sistema de notificações/mensageria | ~5% |
| **C — Computers** | Stack moderna (React, Supabase, ETLs Python) | ~60% |
| **I — Intelligence** | Agregação de dados brutos, sem análise preditiva | ~20% |
| **S — Surveillance** | Monitoramento de 7 domínios (clima, saúde, ambiente, agro, água, legislativo, notícias) | ~40% |
| **R — Reconnaissance** | Sem capacidade de investigação direcionada | ~5% |

### Gaps Críticos Identificados

1. **Sem Common Operating Picture (COP)** — O mapa existe mas não integra todas as camadas em visão unificada com correlação temporal
2. **Sem sistema de alertas inteligente** — Alertas são passivos (exibidos), não ativos (push, SMS, escalation)
3. **Sem fusão de dados** — Cada domínio opera em silo, sem correlação cruzada
4. **Sem workflow de decisão** — Não há suporte ao ciclo OODA (Observe-Orient-Decide-Act)
5. **Sem comunicação integrada** — Não há canal de notificação para operadores/decisores
6. **Sem análise preditiva** — Apenas dados históricos e em tempo real, sem modelos preditivos
7. **Sem módulo de reconhecimento** — Não há capacidade de investigação ad-hoc de áreas específicas
8. **ETLs instáveis** — Vários pipelines com falhas conhecidas (INMET, InfoDengue, ALEP)

---

## 2. Arquitetura C4ISR Proposta

### 2.1 Visão Macro da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMADA DE APRESENTAÇÃO                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   COP    │  │Dashboard │  │ Alertas  │  │   Mobile PWA  │  │
│  │(Mapa 2D) │  │Analítico │  │  Centro  │  │  (Operadores) │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    CAMADA DE DECISÃO (C2)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  OODA    │  │Workflow  │  │ Playbooks│  │  Relatórios   │  │
│  │  Engine  │  │  Engine  │  │ de Crise │  │  Situacionais │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    CAMADA DE INTELIGÊNCIA (I)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Fusão   │  │ Análise  │  │ Modelos  │  │  Correlação   │  │
│  │ de Dados │  │Preditiva │  │   ML/AI  │  │   Cruzada     │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    CAMADA DE COMUNICAÇÃO (C3)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │Push/SMS  │  │ WebSocket│  │  Email   │  │  API Pública  │  │
│  │Notific.  │  │Real-time │  │ Alertas  │  │  (Parceiros)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│               CAMADA DE VIGILÂNCIA & SENSORES (SR)              │
│  ┌─────┐ ┌──────┐ ┌─────┐ ┌────┐ ┌─────┐ ┌────┐ ┌─────────┐ │
│  │INMET│ │FIRMS │ │Info │ │ANA │ │AQICN│ │ALEP│ │Sentinel │ │
│  │     │ │(NASA)│ │Dengue│ │    │ │     │ │    │ │ (ESA)   │ │
│  └─────┘ └──────┘ └─────┘ └────┘ └─────┘ └────┘ └─────────┘ │
│  ┌─────┐ ┌──────┐ ┌─────┐ ┌────┐ ┌─────┐ ┌────┐ ┌─────────┐ │
│  │SIDRA│ │DERAL │ │RSS  │ │GEE │ │IBGE │ │SUS │ │ CEMADEN │ │
│  │     │ │/SEAB │ │News │ │    │ │     │ │    │ │         │ │
│  └─────┘ └──────┘ └─────┘ └────┘ └─────┘ └────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│               CAMADA DE DADOS (C4 - Computers)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  PostgreSQL   │  │  TimescaleDB │  │  Cache (Redis/     │   │
│  │  (Supabase)   │  │  (Séries     │  │   Supabase Cache)  │   │
│  │               │  │   Temporais) │  │                    │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Mapeamento de Componentes C4ISR

**C1 — Command (Comando):**
- Dashboard executivo com visão consolidada
- Geração automática de relatórios situacionais
- Interface de tomada de decisão com playbooks

**C2 — Control (Controle):**
- Motor OODA (Observe → Orient → Decide → Act)
- Workflows de resposta a incidentes
- Escalation automático baseado em severidade
- Registro de ações e audit trail

**C3 — Communications (Comunicações):**
- WebSocket para atualizações em tempo real
- Push notifications (PWA + Firebase)
- Integração SMS via Twilio/Vonage
- Email alertas via SendGrid/Resend
- API pública para sistemas parceiros (Defesa Civil, Bombeiros)

**C4 — Computers (Computadores):**
- Infraestrutura atual (Supabase + GitHub Actions)
- Adição de TimescaleDB para séries temporais
- Edge Functions para processamento distribuído
- Cache inteligente com invalidação por evento

**I — Intelligence (Inteligência):**
- Motor de fusão de dados multi-fonte
- Correlação cruzada entre domínios
- Análise preditiva com modelos ML
- Índice de Risco Territorial Composto (IRTC)
- Detecção de anomalias automatizada

**S — Surveillance (Vigilância):**
- Ampliação dos sensores atuais (7 → 12+ fontes)
- Adição: CEMADEN, Sentinel/Copernicus, Google Earth Engine, DataSUS ampliado
- Monitoramento contínuo 24/7 com health checks

**R — Reconnaissance (Reconhecimento):**
- Módulo de investigação geoespacial sob demanda
- Análise temporal de áreas específicas
- Geração de relatórios de reconhecimento por município
- Integração com imagens de satélite sob demanda

---

## 3. Fases de Implementação

### FASE 0 — Estabilização (Semanas 1-3)

**Objetivo:** Corrigir os problemas conhecidos antes de avançar.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 0.1 | Corrigir ETL Clima (fallback Open-Meteo funcional) | CRÍTICA | Média |
| 0.2 | Corrigir ETL Saúde (batch paralelo, timeout fix) | CRÍTICA | Média |
| 0.3 | Corrigir ETL Ambiente (UNIQUE constraints, retry) | ALTA | Baixa |
| 0.4 | Ativar ETL Agro (primeira execução + validação) | ALTA | Baixa |
| 0.5 | Corrigir ETL Legislativo (retry logic, API instabilidade) | MÉDIA | Baixa |
| 0.6 | Validar todas as migrations (004-009) | ALTA | Baixa |
| 0.7 | Health check dashboard para ETLs | ALTA | Média |

**Entregáveis:**
- Todos os 7 ETLs funcionando de forma estável (>95% uptime)
- Dashboard de monitoramento de saúde dos pipelines
- Documentação de fallbacks para cada fonte de dados

---

### FASE 1 — Common Operating Picture (Semanas 4-8)

**Objetivo:** Criar a visão operacional unificada — o coração do C4ISR.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 1.1 | Redesign do MapPage como COP central | CRÍTICA | Alta |
| 1.2 | Integração de TODAS as camadas no mapa unificado | CRÍTICA | Alta |
| 1.3 | Timeline slider temporal (últimas 48h) | ALTA | Média |
| 1.4 | Painel lateral de situação por município | ALTA | Média |
| 1.5 | Legenda dinâmica e filtros combinados | MÉDIA | Baixa |
| 1.6 | Heatmap de risco composto (multi-domínio) | ALTA | Alta |
| 1.7 | Geofencing: definição de áreas de interesse | MÉDIA | Média |

**Detalhamento Técnico — COP:**

O COP deve exibir simultaneamente:
- Estações meteorológicas (INMET) com dados em tempo real
- Focos de incêndio (FIRMS) com intensidade e confiança
- Alertas de dengue por município (InfoDengue) com classificação cromática
- Níveis de rios (ANA) com indicadores de alerta
- Qualidade do ar (AQICN) nas cidades monitoradas
- Notícias geolocalizadas (quando possível)
- Limites municipais com indicadores de risco composto

**Índice de Risco Territorial Composto (IRTC):**
```
IRTC(município) = w1 × R_clima + w2 × R_saúde + w3 × R_ambiente +
                  w4 × R_hidro + w5 × R_ar
```
Onde:
- R_clima: Risco meteorológico (temperatura extrema, precipitação intensa)
- R_saúde: Risco epidemiológico (nível de alerta dengue, incidência)
- R_ambiente: Risco ambiental (focos de incêndio, desmatamento)
- R_hidro: Risco hidrológico (nível dos rios, vazão)
- R_ar: Risco de qualidade do ar (AQI)
- w1...w5: Pesos configuráveis (default: 0.2 cada)

Escala: 0-100, mapeada para cores: Verde (0-25), Amarelo (26-50), Laranja (51-75), Vermelho (76-100).

**Entregáveis:**
- COP funcional com todas as camadas integradas
- IRTC calculado para todos os 399 municípios
- Timeline temporal funcional
- Painel lateral de situação por município

---

### FASE 2 — Sistema de Alertas e Comunicações (Semanas 9-13)

**Objetivo:** Implementar o C3 (Communications) — alertas ativos e notificações.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 2.1 | Motor de regras de alertas configurável | CRÍTICA | Alta |
| 2.2 | Supabase Realtime (WebSocket) para atualizações live | ALTA | Média |
| 2.3 | Push notifications via PWA (Service Worker) | ALTA | Média |
| 2.4 | Integração SMS (Twilio/Vonage) para alertas críticos | MÉDIA | Média |
| 2.5 | Email digest (diário/semanal) via Resend | MÉDIA | Baixa |
| 2.6 | Centro de alertas no frontend (histórico + gestão) | ALTA | Média |
| 2.7 | Escalation automático (severidade → canal) | ALTA | Média |
| 2.8 | API de webhooks para sistemas externos | MÉDIA | Média |

**Motor de Regras de Alertas:**

```
Tabela: alert_rules
- id, name, description
- domain (clima, saude, ambiente, hidro, ar)
- condition (JSON): { field, operator, threshold }
- severity (critical, high, medium, low)
- channels (array): [push, sms, email, webhook]
- recipients (array): user_ids ou grupos
- cooldown_minutes (evitar spam)
- is_active (boolean)
- created_by, created_at
```

**Exemplos de Regras Pré-configuradas:**
- `Temperatura > 40°C` → SMS + Push (severidade: alta)
- `Nível rio > alerta` → SMS + Push + Email (severidade: crítica)
- `Focos incêndio > 50 em 24h no município` → Push + Email (severidade: alta)
- `Dengue alerta nível 3 (vermelho)` → Email digest (severidade: alta)
- `AQI > 150 (insalubre)` → Push (severidade: média)

**Matriz de Escalation:**

| Severidade | Canais | Tempo de Resposta | Escalation |
|---|---|---|---|
| Crítica | SMS + Push + Email + Webhook | Imediato | Coordenador em 15 min |
| Alta | Push + Email | < 30 min | Analista em 1h |
| Média | Push + Email digest | < 2h | — |
| Baixa | Email digest | Próximo digest | — |

**Entregáveis:**
- Motor de regras funcional com 15+ regras pré-configuradas
- Notificações push via PWA
- Integração SMS para alertas críticos
- Centro de alertas no frontend
- API de webhooks documentada

---

### FASE 3 — Fusão de Dados e Inteligência (Semanas 14-20)

**Objetivo:** Implementar o I (Intelligence) — correlação, predição e análise avançada.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 3.1 | Motor de fusão de dados multi-fonte | CRÍTICA | Alta |
| 3.2 | Correlação cruzada entre domínios | ALTA | Alta |
| 3.3 | Modelo preditivo: risco de incêndio | ALTA | Alta |
| 3.4 | Modelo preditivo: surto de dengue | ALTA | Alta |
| 3.5 | Modelo preditivo: risco de enchente | ALTA | Alta |
| 3.6 | Detecção de anomalias automatizada | MÉDIA | Alta |
| 3.7 | Relatório de inteligência automatizado | ALTA | Média |
| 3.8 | Painel de tendências e previsões | MÉDIA | Média |

**Motor de Fusão de Dados:**

A fusão cruza informações de múltiplos domínios para produzir insights que nenhuma fonte isolada fornece:

```
Exemplo de Correlação:
  Temperatura > 35°C (INMET)
  + Umidade < 30% (INMET)
  + Sem chuva há 15 dias (INMET)
  + Focos de incêndio crescentes (FIRMS)
  + AQI deteriorando (AQICN)
  = ALERTA COMPOSTO: Alto risco de incêndio florestal
    com impacto na qualidade do ar
    → Acionar protocolo de prevenção
```

```
Exemplo de Correlação:
  Precipitação acumulada > 100mm/24h (INMET)
  + Nível dos rios subindo (ANA)
  + Histórico de enchente no município (dados IBGE)
  = ALERTA COMPOSTO: Risco de enchente
    → Acionar alerta Defesa Civil
```

**Modelos Preditivos (Python/scikit-learn → Supabase Edge Function):**

1. **Risco de Incêndio:** Random Forest com features: temperatura, umidade, precipitação acumulada, velocidade do vento, dias sem chuva, NDVI (vegetação via Sentinel). Horizonte: 72h.

2. **Surto de Dengue:** Série temporal (Prophet/ARIMA) com features: casos semana anterior, temperatura média, precipitação acumulada, sazonalidade. Horizonte: 4 semanas.

3. **Risco de Enchente:** Gradient Boosting com features: precipitação acumulada, nível dos rios, vazão, histórico de cheias, topografia. Horizonte: 48h.

**Relatório de Inteligência Automatizado (Gerado diariamente):**
```
RELATÓRIO SITUACIONAL - PARANÁ
Data: [data] | Período: últimas 24h

1. RESUMO EXECUTIVO
   - [indicadores-chave consolidados]

2. ALERTAS ATIVOS
   - [lista por severidade]

3. TENDÊNCIAS
   - Clima: [tendência 72h]
   - Saúde: [tendência 4 semanas]
   - Ambiente: [evolução focos/qualidade ar]

4. PREDIÇÕES
   - Municípios em risco elevado nas próximas 48-72h

5. RECOMENDAÇÕES
   - Ações sugeridas por prioridade
```

**Entregáveis:**
- Motor de fusão funcional com 5+ correlações configuradas
- 3 modelos preditivos treinados e em produção
- Relatório de inteligência diário automatizado
- Painel de tendências no frontend

---

### FASE 4 — Workflow de Decisão OODA (Semanas 21-26)

**Objetivo:** Implementar o C2 (Command & Control) completo — ciclo de decisão estruturado.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 4.1 | Motor OODA com estados e transições | CRÍTICA | Alta |
| 4.2 | Playbooks de resposta (templates de ação) | ALTA | Média |
| 4.3 | Interface de gestão de incidentes | ALTA | Alta |
| 4.4 | Registro de ações e audit trail | ALTA | Média |
| 4.5 | Relatórios pós-incidente | MÉDIA | Média |
| 4.6 | Dashboard executivo (visão do comandante) | ALTA | Média |
| 4.7 | Integração com Defesa Civil (protocolos) | MÉDIA | Alta |

**Ciclo OODA Implementado:**

```
OBSERVE (Observar)
├── Sensores detectam anomalia
├── Motor de fusão correlaciona
├── Alerta gerado automaticamente
│
ORIENT (Orientar)
├── Contextualização automática (histórico, tendência)
├── Classificação de severidade
├── Identificação de municípios/populações afetadas
├── Dados geoespaciais do incidente
│
DECIDE (Decidir)
├── Playbook sugerido baseado no tipo de incidente
├── Opções de ação com impacto estimado
├── Interface de decisão para o operador
├── Aprovação/modificação do plano de ação
│
ACT (Agir)
├── Disparo de notificações para stakeholders
├── Registro da ação no sistema
├── Monitoramento de eficácia (feedback loop)
├── Atualização do COP
└── Retorno ao OBSERVE (ciclo contínuo)
```

**Tabela de Incidentes:**
```
incidents
- id, title, description
- type (incendio, enchente, surto, seca, qualidade_ar, outro)
- severity (critical, high, medium, low)
- status (detected, analyzing, responding, resolved, closed)
- ooda_phase (observe, orient, decide, act)
- affected_area (GeoJSON)
- affected_municipalities (array)
- detected_at, resolved_at
- playbook_id (FK)
- actions_taken (JSONB array)
- assigned_to (user_id)
- audit_log (JSONB array com timestamps)
```

**Playbooks Pré-configurados:**

1. **Incêndio Florestal:** Alerta FIRMS → Verificar condições meteorológicas → Notificar Corpo de Bombeiros → Monitorar propagação → Avaliar qualidade do ar → Atualizar COP
2. **Risco de Enchente:** Alerta ANA → Verificar previsão de chuva → Notificar Defesa Civil → Monitorar nível dos rios → Avaliar necessidade de evacuação → Atualizar COP
3. **Surto Epidemiológico:** Alerta InfoDengue nível 3 → Verificar municípios vizinhos → Notificar Secretaria de Saúde → Monitorar evolução semanal → Recomendar ações de controle
4. **Onda de Calor:** Temperatura extrema → Verificar duração prevista → Notificar Saúde + Agricultura → Monitorar impactos → Recomendar medidas de mitigação

**Entregáveis:**
- Motor OODA funcional com interface gráfica
- 4+ playbooks configurados
- Sistema de gestão de incidentes completo
- Audit trail para todas as ações
- Dashboard executivo

---

### FASE 5 — Reconhecimento e Sensores Avançados (Semanas 27-32)

**Objetivo:** Expandir SR (Surveillance & Reconnaissance) com novas fontes e capacidades.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 5.1 | Integração CEMADEN (alertas de desastres naturais) | ALTA | Média |
| 5.2 | Integração Sentinel/Copernicus (imagens satélite) | ALTA | Alta |
| 5.3 | Integração Google Earth Engine (NDVI, uso do solo) | MÉDIA | Alta |
| 5.4 | Módulo de reconhecimento por município | ALTA | Média |
| 5.5 | Análise temporal de séries (antes/depois) | MÉDIA | Média |
| 5.6 | DataSUS ampliado (internações, mortalidade) | MÉDIA | Média |
| 5.7 | Integração DENATRAN (acidentes rodoviários) | BAIXA | Média |
| 5.8 | Integração CAR/SICAR (Cadastro Ambiental Rural) | MÉDIA | Média |

**Módulo de Reconhecimento por Município:**

Permite investigação aprofundada de um município específico com:
- Perfil completo (população, área, IDHM, PIB per capita)
- Situação atual de todos os indicadores
- Histórico temporal (gráficos de evolução)
- Comparação com municípios vizinhos
- Imagem de satélite recente (Sentinel)
- NDVI e uso do solo (GEE)
- Previsão de riscos para as próximas 72h
- Ações recomendadas

**Novas Fontes de Dados:**

| Fonte | Tipo de Dado | Frequência | Prioridade |
|---|---|---|---|
| CEMADEN | Alertas geológicos/hidrológicos | Tempo real | Alta |
| Sentinel-2 | Imagens multiespectrais 10m | 5 dias | Alta |
| Google Earth Engine | NDVI, uso do solo, mudança | Sob demanda | Média |
| DataSUS/TabNet | Internações, mortalidade, vigilância | Semanal | Média |
| SICAR/CAR | Cadastro ambiental, APP, RL | Mensal | Média |
| DENATRAN | Acidentes rodoviários | Mensal | Baixa |

**Entregáveis:**
- 4+ novas fontes de dados integradas
- Módulo de reconhecimento municipal completo
- Análise temporal com comparação antes/depois
- Imagens de satélite integradas ao COP

---

### FASE 6 — PWA, API Pública e Interoperabilidade (Semanas 33-38)

**Objetivo:** Tornar o sistema acessível em campo e interoperável com sistemas externos.

| # | Tarefa | Prioridade | Complexidade |
|---|--------|-----------|-------------|
| 6.1 | PWA completo (offline-first, installable) | ALTA | Alta |
| 6.2 | Versão mobile responsiva otimizada | ALTA | Média |
| 6.3 | API REST pública documentada (OpenAPI 3.0) | ALTA | Média |
| 6.4 | Webhooks para integração com sistemas parceiros | MÉDIA | Média |
| 6.5 | Exportação de dados (CSV, GeoJSON, PDF) | MÉDIA | Baixa |
| 6.6 | Integração com SISDEC (Sistema de Defesa Civil) | MÉDIA | Alta |
| 6.7 | SSO / integração com gov.br | BAIXA | Alta |
| 6.8 | Modo offline com sync automático | MÉDIA | Alta |

**API Pública — Endpoints Principais:**

```
GET /api/v1/cop/status              → Situação geral do estado
GET /api/v1/cop/municipality/:ibge  → Situação de um município
GET /api/v1/alerts/active           → Alertas ativos
GET /api/v1/incidents/active        → Incidentes em andamento
GET /api/v1/risk/irtc               → Índice de risco por município
GET /api/v1/sensors/clima           → Dados meteorológicos
GET /api/v1/sensors/hidro           → Dados hidrológicos
GET /api/v1/sensors/health          → Dados epidemiológicos
GET /api/v1/predictions/:domain     → Predições por domínio
POST /api/v1/webhooks/subscribe     → Registrar webhook
```

**Entregáveis:**
- PWA funcional e instalável
- API pública com documentação OpenAPI
- Exportação de dados em múltiplos formatos
- Pelo menos 1 integração com sistema governamental

---

## 4. Cronograma Consolidado

```
2026
Abr         Mai         Jun         Jul         Ago         Set         Out
|           |           |           |           |           |           |
├── FASE 0 ─┤
│ Estabiliz.│
│ (3 sem)   │
│           ├── FASE 1 ─────────────┤
│           │ COP                   │
│           │ (5 sem)               │
│           │                       ├── FASE 2 ─────────────┤
│           │                       │ Alertas & Comunicação  │
│           │                       │ (5 sem)                │
│           │                       │                        ├── FASE 3 ──────
│           │                       │                        │ Inteligência
│           │                       │                        │ (7 sem)

2026-2027
Out         Nov         Dez         Jan         Fev
|           |           |           |           |
── FASE 3 ──┤
             ├── FASE 4 ─────────────┤
             │ OODA / C2              │
             │ (6 sem)                │
             │                        ├── FASE 5 ─────────────┤
             │                        │ Recon. & Sensores      │
             │                        │ (6 sem)                │
             │                        │                        ├── FASE 6 ──
             │                        │                        │ PWA & API
             │                        │                        │ (6 sem)
```

**Duração Total Estimada:** ~38 semanas (~9 meses)
**Início Estimado:** Abril 2026
**Conclusão Estimada:** Janeiro 2027

---

## 5. Stack Tecnológica Detalhada

### Manutenção (já em uso)
- Frontend: React 18 + TypeScript + Vite + Tailwind
- Backend: Supabase (PostgreSQL + Auth + Edge Functions)
- Mapa: Leaflet + React-Leaflet
- Gráficos: Recharts + D3.js
- ETL: Python 3.11 + GitHub Actions
- CI/CD: GitHub Actions + GitHub Pages
- Pagamento: Stripe

### Adições por Fase

| Fase | Tecnologia | Finalidade |
|---|---|---|
| 0 | Sentry melhorado, Uptime Robot | Monitoramento de ETLs |
| 1 | Turf.js, Deck.gl (opcional) | Análise geoespacial, heatmaps |
| 2 | Supabase Realtime, Firebase FCM, Twilio, Resend | Comunicações multi-canal |
| 3 | scikit-learn, Prophet, Edge Functions (Deno) | Modelos preditivos |
| 4 | State machine (XState), Supabase RLS refinado | Workflow OODA |
| 5 | Google Earth Engine API, SentinelHub, STAC API | Sensoriamento remoto |
| 6 | Workbox (PWA), OpenAPI Generator, IndexedDB | Mobile, API, offline |

---

## 6. Métricas de Sucesso

### KPIs Operacionais

| Métrica | Meta Fase 1 | Meta Final |
|---|---|---|
| Uptime dos ETLs | >95% | >99% |
| Latência do COP (carregamento) | <5s | <2s |
| Tempo de detecção de incidente | <30 min | <5 min |
| Tempo de notificação (após detecção) | <15 min | <1 min |
| Cobertura municipal (dados disponíveis) | 80% | 95% |
| Precisão dos modelos preditivos | — | >75% (F1) |
| Municípios com IRTC calculado | 399 (100%) | 399 (100%) |

### KPIs de Produto

| Métrica | Meta |
|---|---|
| Usuários ativos mensais | 100+ (Fase 3), 500+ (Fase 6) |
| Conversão trial → pago | >15% |
| NPS | >40 |
| Tempo médio de sessão | >10 min |

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| APIs governamentais instáveis (INMET, ANA, ALEP) | Alta | Alto | Múltiplos fallbacks, cache agressivo, retry com backoff |
| Custo Supabase escalar com dados | Média | Médio | Política de retenção, TimescaleDB compression, cleanup automático |
| Complexidade dos modelos ML sem dados históricos suficientes | Alta | Médio | Começar com heurísticas simples, evoluir para ML gradualmente |
| Dependência de GitHub Actions para ETL (limites) | Média | Alto | Migrar ETLs críticos para Supabase Cron ou worker dedicado |
| Dificuldade de integração com sistemas governamentais | Alta | Médio | Começar com APIs públicas, avançar para integrações formais em parceria |
| Custo de SMS/Push em escala | Baixa | Baixo | Throttling inteligente, priorização por severidade |

---

## 8. Orçamento Estimado (Mensal, Pós-Implementação)

| Item | Custo Mensal Estimado |
|---|---|
| Supabase Pro | ~R$ 125 (US$25) |
| Twilio (SMS, ~1000 msgs/mês) | ~R$ 250 |
| Resend (Email, ~5000/mês) | Gratuito |
| Firebase FCM (Push) | Gratuito |
| SentinelHub (Starter) | ~R$ 250 (€50) |
| GitHub Actions (overage) | ~R$ 0 (dentro do free tier com otimização) |
| Domínio + SSL | ~R$ 50 |
| **Total Estimado** | **~R$ 675/mês** |

---

## 9. Próximos Passos Imediatos

1. **Aprovar este plano** e definir prioridades de negócio
2. **Iniciar Fase 0** — estabilização dos ETLs existentes
3. **Definir pesos do IRTC** com stakeholders (secretarias estaduais)
4. **Estabelecer parcerias** com Defesa Civil PR e CEMADEN para acesso a dados
5. **Configurar ambiente de desenvolvimento** para testes dos modelos preditivos

---

*Este documento deve ser revisado e atualizado a cada conclusão de fase.*
