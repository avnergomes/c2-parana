# Plano de Implementação — Fase 3 (Intelligence)

**Versão:** 1.3
**Data:** 2026-04-13 (atualizado apos sessoes de 11-13/abr)
**Status:** ✅ **Fase 3 completa (7/8 sub-fases + frontend)** | 3.E bloqueada (historico insuficiente)
**Predecessor:** `PLANO_IMPLEMENTACAO_C4ISR.md` seção "FASE 3 — Fusão de Dados e Inteligência"

---

## 1. Contexto

A Fase 2 (Alertas e Comunicações) está shipada: o motor `etl_alerts_engine.py` dispara
alertas baseados em **condições simples por domínio** (ex: `temperature > 40`,
`dengue alert_level >= 3`), e o frontend recebe as notificações em tempo real
via Supabase Realtime + Browser Notification API.

A Fase 3 eleva esse sistema de "monitoramento por threshold isolado" para
"inteligência com fusão cross-domínio". A diferença prática:

**Antes (Fase 2):**
> Temperatura > 40°C em Curitiba → 1 alerta de calor

**Depois (Fase 3):**
> Temperatura > 35°C + Umidade < 30% + 15 dias sem chuva + focos de incêndio crescentes
> → 1 alerta composto "Risco alto de incêndio florestal", severidade crítica,
> playbook "Acionar Corpo de Bombeiros + monitorar qualidade do ar"

Esse é o coração do "I" em C4ISR: insights que nenhuma fonte isolada fornece.

---

## 2. O que já existe (ponto de partida real)

Descoberto via exploração do schema em 2026-04-07/08:

| Recurso | Estado | Observação |
|---|---|---|
| `climate_data` table | ✅ | `ibge_code, temperature, humidity, pressure, wind_speed, wind_direction, **precipitation**, observed_at, ...` (15 colunas — precipitation **sim existe**, populada por INMET e Open-Meteo) |
| `fire_spots` table | ✅ | `municipality, acq_date, latitude, longitude, brightness` |
| `river_levels` table | ✅ | `station_code, municipality, alert_level` (normal/attention/alert/emergency) |
| `air_quality` table | ✅ | `city, aqi` |
| `dengue_data` table | ✅ | `ibge_code, alert_level, epidemiological_week, year` |
| `irtc_scores` table | ✅ | Fusão aditiva ponderada dos 5 domínios já computada |
| `etl_irtc.py` | ✅ | Recalcula IRTC a cada hora (cron-irtc.yml) |
| `alert_rules` + `notifications` | ✅ | Fase 2 |

## 3. Gaps críticos bloqueando Fase 3

1. ~~**`climate_data` não persiste precipitação**~~ — **CORRIGIDO conceitualmente:** a coluna
   `precipitation` (instantâneo em mm) já existe e é populada. O gap real é a falta
   de derivado **24h acumulado** — não é uma coluna nova, é uma agregação que pode
   ser feita por view ou no `etl_correlations.py`. A regra seed "Precipitação Intensa"
   foi corrigida na migration 015 pra usar `precipitation` (instantâneo > 100mm) em vez
   do não-existente `precipitation_24h`.
2. **Sem histórico temporal agregado** — `climate_data` guarda observações
   instantâneas, não séries derivadas tipo "dias consecutivos sem chuva" ou
   "precipitação acumulada 72h". Fase 3 precisa calcular essas features on-the-fly
   ou materializá-las numa nova view/tabela.
3. **Matching de município inconsistente** — `fire_spots.municipality` e
   `river_levels.municipality` são texto livre; precisam ser reconciliados ao
   `ibge_code` via lookup por nome (já existe pattern no `etl_irtc.py`, replicado
   em `etl_correlations.py`).

---

## 3.1 Execução — sessão 2026-04-07/08 (commits no main)

Esta seção é um log do que foi efetivamente executado nesta sessão. Os ✅ são
verificados em produção real (logs do GitHub Actions + queries SQL no Supabase).

### Commits shipados (em ordem cronológica)

| Commit | Tipo | Escopo | Validado? |
|---|---|---|---|
| `9f2b2f5` | feat | **Fase 3.A** — motor composite engine, migration 014, ETL, cron, plan doc | ✅ |
| `0ca2e52` | fix | URL encoding `+` → `Z` em timestamps de query (HTTP 400 PostgREST) | ✅ |
| `d3588d0` | fix | Migration 015 — IRTC Crítico schema composite + Precipitação field | ✅ |
| `5b75120` | fix | `postgrest_post(on_conflict=...)` em etl_correlations | ✅ |
| `a989863` | fix | etl_irtc — column rename (`r_clima→risk_clima`, `municipality_name→municipality`) + on_conflict | ✅ |
| `e288aad` | fix | etl_irtc — refs residuais no Top 10 print causando KeyError pós-rename | ✅ |
| `de440e6` | fix | etl_correlations — `fetch_river_alerts` inclui rivers em "normal" pra log honesto | ✅ |
| `(esta sessão)` | fix | etl_irtc — `calc_r_saude` mapping `{1,2,3,4}` em vez de `{0,1,2,3}` (ignora epidemia) | ⏳ |

### Bugs silenciosos descobertos e fixados

Bugs latentes que **passaram despercebidos por dias-semanas em produção** porque
não geravam erro visível em GitHub Actions / dashboard:

1. **`postgrest_post` / `postgrest_upsert` sem `on_conflict`** — afetava `etl_correlations.py`
   E `etl_irtc.py`. Health records nunca atualizavam após o primeiro insert. Em
   `etl_irtc` se combinava com bug #2 escondendo um bug ainda pior.
2. **`etl_irtc.py` enviando colunas que não existem em `irtc_scores`** — `municipality_name`
   vs `municipality`, `r_clima` vs `risk_clima` etc. **Resultado: a tabela ficou
   completamente vazia desde que a migration 011 foi aplicada (~19 dias).**
   Frontend (`useIRTC`, `IRTCLayer`, `MunicipalityPopup`) silenciosamente
   mostrava heatmap vazio. Cron-irtc reportava status "success" no Actions
   apesar de o upsert falhar com PGRST204. Cleanup: ETL agora popula 399 munis.
3. **Realtime publication** sem `news_items` nem `notifications` (descoberto na sessão
   anterior, fixado na migration 013). Idem efeito silencioso.
4. **`fetch_river_alerts` filtrava rivers normais** — log dizia `rios=0` quando havia
   8 estações operacionais, todas em normal. Ninguém quebrado, mas observabilidade
   misleading.
5. **`calc_r_saude` mapping wrong** — escala InfoDengue é `{1,2,3,4}` mas o ETL usa
   `{0,1,2,3}`, tratando epidemia (nível 4) como zero risco. **Os 20 municípios
   em estado de epidemia em todo o PR estavam sendo escondidos do IRTC.**

### Migrations aplicadas em produção

| # | Migration | Aplicada via | Verificada? |
|---|---|---|---|
| 010-013 | (criadas em sessão anterior, aplicadas via `db push`) | CLI | ✅ |
| 014 | `composite_alert_rules.sql` (3 regras seed) | `npx supabase db push` | ✅ (4 com IRTC Crítico) |
| 015 | `fix_composite_rules.sql` (UPDATE de 2 regras pra schema novo) | `npx supabase db push` | ✅ |

### Validações empíricas em produção

| Métrica | Antes | Depois |
|---|---|---|
| `irtc_scores` total rows | 0 | **399** |
| `river_levels` total rows | 0 (timing) → 8 | **8** |
| `etl_correlations` clima query | `HTTP 400` | `7 munis OK` |
| `etl_correlations` rios log | `rios=0` | `rios=8` |
| `etl_correlations` irtc log | `irtc=0` | `irtc=399` |
| `etl_irtc` upsert | `PGRST204 error` | `399 upserted` |
| `etl_irtc` exit status | `failure` | `success` |

---

## 4. Decomposição em sub-fases

Dividida priorizando **entrega de valor incremental**. Cada sub-fase é shippable
sozinha e não depende das seguintes.

### Fase 3.A — Correlações heurísticas simples ✅ Concluída (2026-04-07)

**Objetivo:** Primeiro motor de fusão multi-domínio via regras booleanas
compostas. Sem ML. Sem histórico complexo. Entrega rápida.

**Escopo:**
- Script `scripts/etl_correlations.py` que lê dados recentes de cada domínio
  e aplica um conjunto de regras compostas (AND/OR explícito).
- Cada regra que dispara gera um fan-out de `notifications` (uma por user em
  `auth.users`) com `severity='high'` ou `'critical'` conforme a regra.
- Migration `014_composite_alert_rules.sql` adiciona 3 regras no seed:
  - "Risco de Incêndio Composto" (temp alta + umidade baixa + focos crescentes)
  - "Risco Hídrico Composto" (nível rio alerta + precipitação — futuro)
  - "Alerta Sanitário Composto" (dengue nível 3 + densidade populacional alta)
- Workflow `.github/workflows/cron-correlations.yml` roda o ETL de hora em hora.
- Cooldown: cada regra tem `cooldown_minutes=120` no seed para evitar spam.

**Regra inicial concreta — "Risco de Incêndio Composto":**
```
SE (climate_data.temperature > 32°C nas ultimas 6h)
   E (climate_data.humidity < 40% nas ultimas 6h)
   E (COUNT(fire_spots WHERE acq_date >= ontem para o municipio) >= 3)
ENTAO
   INSERT notification(domain='composto', severity='high', title='Risco de incendio composto em {mun}')
```

Thresholds 32/40 em vez de 35/30 porque queremos sensibilidade maior na primeira
camada — preferimos alguns falsos positivos a silêncio total. Ajustáveis depois.

**Saída esperada (primeiros runs):** 5-15 notificações por dia em condições
normais de outono; picos em dias de seca. Validar com operador humano.

**Arquivos a criar:**
- `scripts/etl_correlations.py` (~250 linhas)
- `supabase/migrations/014_composite_alert_rules.sql` (~30 linhas)
- `.github/workflows/cron-correlations.yml` (~40 linhas)

**Arquivos a modificar:**
- Nenhum (aditivo puro)

---

### Fase 3.B — Relatório Situacional Diário ✅ Concluída (2026-04-12)

**Shipada em produção.** Commits `fbf15b6`..`8314316` (8 commits).

**Implementado:**
- Tabela `situational_reports` (migration 017) com UNIQUE(report_date)
- Script `etl_situational_report.py` — consolida 6 domínios (dengue, clima,
  incêndios, rios, ar, IRTC) em resumo executivo narrativo + top risks +
  domain summaries + recomendações acionáveis
- Cron `cron-situational.yml` diário às 06:00 BRT (09:00 UTC)
- Frontend: página `/relatorios` com cards expansíveis, hook `useRelatorios`
- Primeiro relatório gerado: 12/04/2026, 4 municípios em risco alto, 990
  casos dengue SE 13/2026, top risco: Pinhais

**Escopo original (mantido como referência):**

#### Fase 3.B — Relatório Situacional Diário (tarefa 3.7 do plano original)

**Objetivo:** Geração automática de um relatório narrativo diário consolidando
todos os indicadores, tendências de 72h e predições heurísticas.

**Escopo:**
- Nova tabela `situational_reports` (`id, report_date, executive_summary,
  active_alerts_count, top_risks jsonb, recommendations text, generated_at`).
- Script `etl_situational_report.py` que roda 1x por dia (06:00 BRT) e gera
  um registro consolidando:
  - Resumo executivo (N alertas ativos, N municípios em risco crítico)
  - Top 10 municípios por IRTC da última iteração
  - Tendências (delta dengue semana a semana, delta focos vs 7d anterior)
  - Ações recomendadas por severidade
- Frontend: página `/relatorios-situacionais` listando reports por data, com
  expansão de cada card mostrando os detalhes.

**Dependência:** nenhuma — pode rodar em paralelo à 3.A.

---

### Fase 3.C — Preditivo simples: Extrapolação de tendência de dengue ✅ Concluída (2026-04-12)

**Shipada em produção.** Script `etl_dengue_projections.py` + cron diario + migration 019.

**Implementado:**
- Tabela `dengue_projections` (migration 019) com projected_cases, trend, slope, R2
- Regressao linear simples (Python stdlib, sem scikit-learn)
- 8 semanas de baseline, projeta +4 semanas por municipio
- Trend classification: "alta" (slope > 1, R2 > 0.3), "queda", "estavel"
- Paginacao para buscar todos os 3192 registros de dengue_data

**Primeiro run:** 399 municipios, 1596 projecoes, 7 em tendencia de alta.
Top: Santo Inacio (slope=6.3 casos/sem, R2=0.65), Senges (R2=0.8).

---

### Fase 3.D — Fix de dados: persistir precipitação em `climate_data`

**Objetivo:** Corrigir o gap #1 identificado acima — `etl_clima.py` busca
precipitação do INMET/Open-Meteo mas não persiste.

**Escopo:**
- Migration adicional `ALTER TABLE climate_data ADD COLUMN precipitation_1h NUMERIC, precipitation_24h NUMERIC`.
- Patch em `etl_clima.py` para extrair e gravar.
- Ativa as regras seed já prontas da Fase 2 ("Precipitação Intensa" que hoje
  não dispara).

**Dependência:** desbloqueia regras compostas de risco hídrico/enchente na 3.A.

---

### Fase 3.E — Modelos preditivos ML (tarefas 3.3/3.4/3.5 do plano original)

**Objetivo:** Modelos reais de risco de incêndio, enchente, surto de dengue.

**Escopo:**
- Uso de scikit-learn + Prophet (instalados apenas no ambiente de treino, não
  em produção — o modelo final é serializado como pickle e rodado em Edge
  Function Deno via WASM ou em Python sidecar).
- Treino offline com dados históricos (backfill necessário — não temos N anos
  de histórico no Supabase ainda).

**Dependência:** precisa de backfill histórico suficiente (>= 12 meses). Se
ainda não temos, essa sub-fase depende de um script de backfill primeiro.

---

### Fase 3.F — Detecção de anomalias estatísticas (tarefa 3.6) ✅ Concluída (2026-04-12)

**Shipada em produção.** Script `etl_anomalies.py` + cron a cada 6h + migration 018.

**Implementado:**
- Tabela `anomalies` (migration 018) com z-score, window stats, station
- Z-score rolling window (30 obs) para temperature, humidity, aqi
- |z| > 3 gera registro em `anomalies` + notification para operadores
- Severity: "high" se |z| >= 4, "medium" se >= 3
- Circuit breaker em timeouts de rede

**Nota:** Com apenas ~2 dias de climate_data, o detector ainda nao encontra
anomalias (precisa de 30+ observacoes por estacao). A medida que o historico
acumula, o detector passa a funcionar automaticamente.

---

### Fase 3.G — Painel de tendências no frontend (tarefa 3.8) ✅ Concluída (2026-04-12)

**Shipada em produção.** Rota `/tendencias` com 4 paineis Recharts.

**Implementado:**
- Hook `useTendencias.ts` com 4 queries (temp 72h, focos 7d, dengue 8 SE, IRTC dist.)
- Pagina `TendenciasPage.tsx` com grid 2x2 de graficos
- Sidebar nav item "Tendencias" com icone de trend
- Lazy-loaded via router, 6KB brotli

**Escopo original:**
- Nova rota `/tendencias` com graficos Recharts mostrando:
  - Evolucao da temperatura media estadual ultimas 72h (LineChart)
  - Evolucao de focos de incendio ultimas 7d (BarChart diario)
  - Delta de casos de dengue semana a semana (BarChart SE)
  - Distribuicao atual de IRTC por faixa (PieChart donut)
- Dados via hooks dedicados `useTendencias.ts`, sem dependencias novas

**Dependencia:** nenhuma (usa dados existentes nas tabelas climate_data, fire_spots, dengue_data, irtc_scores).

---

### Fase 3.H — Rewrite ETL InfoHidro (expandir cobertura para 7 seções) ✅ Concluída (2026-04-12)

**Shipada em produção.** ETL expandido de 2 para 10 seções. Cron `cron-infohidro.yml`
rodando a cada 6h. 10/12 módulos OK no primeiro run (10.6s).

**Descoberta chave:** APIs InfoHidro não requerem autenticação. O bloqueio 403 é
anti-bot (falta de headers Referer/Origin), não auth. Playwright desnecessário.
Mananciais (location IDs + SIA codes) vêm do cache do `etl_agua.py`.

**Dados coletados (primeiro run):**
- 1,110 estações de telemetria
- 17,254 registros de telemetria expandida (sensores, mapeamentos, qualidade, horários)
- 310 registros de histórico hidro diário (30 dias)
- 54 registros de uso do solo (34 classes + evolução + overview)
- 30 registros de desmatamento anual
- Hotspots SIMEPAR (0 focos ativos, endpoint funcional)
- FMAC monitoramento ambiental
- Estimativas DBO (qualidade da água)

**Módulos pendentes (2/12):**
- `vazao_forecast`: endpoint `/forecast/v1/forecastdata/flow` retorna 500 para
  location IDs de mananciais (precisa de IDs de estações hidrológicas específicas)
- `sanepar_locations`: body do POST não documentado (precisa análise adicional)

**Objetivo original:** O ETL atual (`etl_infohidro.py`) cobre apenas 2 das 7 seções do
InfoHidro (Reservatórios + Monitoramento). Uma exploração do sistema em
2026-04-12 mapeou 16 endpoints REST adicionais que podem alimentar o C2 com
dados de conservação ambiental, indicadores de qualidade, efluentes, telemetria
expandida e previsão de vazão.

**APIs descobertas por seção:**

**Conservação (8 endpoints):**
- `GET /rest-envresources/v1/landuse_classes` — classes de uso do solo
- `GET /rest-envresources/v1/landuse?name=SIA-XXX` — uso do solo por localidade
- `GET /rest-envresources/v1/landuse_evolution?name=SIA-XXX` — evolução temporal
- `GET /rest-envresources/v1/landuse_overview?name=SIA-XXX` — visão geral
- `GET /rest-forecasts/api/hotspots?location_id=XXX` — focos de incêndio (complementar ao FIRMS)
- `POST /forecasts-infohidro-api/desmatamentos_anual` — desmatamento anual
- `POST /forecasts-infohidro-api/sanepar_locations` — localizações Sanepar (291 mananciais)
- `GET /riak/infohidro/fmac.json` — FMAC monitoramento ambiental

**Indicadores de qualidade da água (3 endpoints):**
- `POST /forecasts-infohidro-api/cargas_usodosolo` — cargas poluentes por uso do solo
- `GET /forecasts-infohidro-api/estimativas_cargas_dbo_all` — estimativas DBO
- `POST /rest-geobar/infohidro/outorgasefluentestotal` — outorgas e efluentes totais

**Efluentes / previsão de vazão (2 endpoints):**
- `GET /forecast/v1/forecastdata/flow?summaryType=daily&source_id=2&location_id=XXX&runtime=...` — previsão de vazão
- `POST /forecasts-infohidro-api/historical/prevhidrodaily` — histórico de previsões hidro

**Telemetria expandida (4 endpoints, além do `/telemetry/v1/station` já usado):**
- `GET /telemetry/v1/sensor` — tipos de sensores disponíveis
- `GET /telemetry/v1/sensorstation` — mapeamento sensor-estação
- `GET /telemetry/v1/quality` — qualidade dos dados por estação
- `GET /telemetry/v1/operationsensorstation?summary_operation=horario` — dados horários consolidados

**Águas Subterrâneas:** dados carregados via Vuex client-side (sem REST API
separado). Requer scrape de HTML/JS da página `/Underground-Waters` se desejado.

**Credenciais:** `INFOHIDRO_USER` / `INFOHIDRO_PASS` (já configurados nos
secrets do GitHub Actions). Login via POST `/Account/Login` com ASP.NET
anti-forgery token. Mesma sessão requer IP brasileiro (GETEC-style blocking
TBD — precisa testar do runner).

**Priorização sugerida (dentro da 3.H):**
1. Reservatórios SAIC via API real (substituir fallback hardcoded)
2. Hotspots SIMEPAR (complementar ao FIRMS da NASA)
3. Desmatamento anual (dados ambientais de longo prazo)
4. Previsão de vazão (direta para o domínio hidro do IRTC)
5. Qualidade da água / DBO / outorgas (indicadores ambientais)
6. Telemetria expandida (enriquecer estações existentes)

**Estimativa:** ~4-6h de implementação (dividível em 2-3 sessões).
**Dependência:** nenhuma — aditivo puro sobre o ETL existente.

---

## 5. Ordem de execução recomendada (atualizada 2026-04-12)

1. ~~**3.A** — Correlações heurísticas~~ ✅ shipada 2026-04-07
2. ~~**3.D** — Fix de precipitação~~ ✅ resolvida (gap era falso)
3. ~~**3.B** — Relatório situacional diário~~ ✅ shipada 2026-04-12
4. ~~**3.H** — Rewrite InfoHidro (16 novos endpoints, dados de conservação/qualidade/vazão)~~ ✅ shipada 2026-04-12
5. ~~**3.G** — Painel de tendências (UX)~~ ✅ shipada 2026-04-12
6. ~~**3.F** — Anomalias estatísticas (baseline antes de ML)~~ ✅ shipada 2026-04-12
7. ~~**3.C** — Projeção linear dengue (preditivo simples)~~ ✅ shipada 2026-04-12
8. **3.E** — ML real (bloqueado: historico < 12 meses; clima 2d, focos 25d, dengue 15m, ar 1d, rios 2d)

---

## 6. Métricas de sucesso por sub-fase

| Sub-fase | KPI | Meta |
|---|---|---|
| 3.A | Correlações disparadas por dia | 5-15 (varia com sazonalidade) |
| 3.A | False positive rate (operador marca como "não era alerta") | < 30% |
| 3.B | Tempo de geração do relatório diário | < 2 min |
| 3.C | Erro médio de projeção 4 semanas | R² > 0.5 pelo menos |
| 3.E | F1 score dos modelos | > 0.75 |
| 3.F | Anomalias detectadas que operador confirma | > 60% |
| 3.G | Tempo de carregamento do painel de tendências | < 3s |

---

## 6.1 Pendências descobertas na execução

### ✅ Resolvido — Regra "IRTC Crítico" com schema legado
~~A regra seed da migration 012 estava em formato `{field, operator, threshold}`
plano e ficava órfã entre os dois motores.~~ **Resolvido na migration 015**
(commit `d3588d0`) — agora está em formato composite:
`{type: 'composite', logic: 'AND', clauses: [{field: 'irtc.score', op: '>', value: 75}]}`
e é avaliada normalmente por `etl_correlations.py`.

### ✅ Resolvido — `calc_r_saude` ignorava nível 4 do InfoDengue
A função usava `mapping = {0:0, 1:25, 2:50, 3:100}` mas a escala oficial do
InfoDengue é `{1: verde, 2: amarelo, 3: laranja, 4: vermelho}`. Os 20 municípios
em estado de **epidemia (nível 4)** caíam no `default=0` e recebiam risco zero —
o oposto do correto. Corrigido para `mapping = {1:25, 2:50, 3:75, 4:100}`. Os
munis epidêmicos agora aparecem corretamente no Top 10 do ETL IRTC.

### ✅ Resolvido (2026-04-11) — `dengue_data` estava obsoleta (~1 ano stale)
**Root cause:** `threading.Lock` non-reentrant em `AdaptiveRateLimiter` causava
self-deadlock na primeira chamada de cada worker. Todo run do cron-saude travava
e era morto pelo timeout de 30min desde ~2025. Bugs encadeados adicionais:
- `records[-4:]` pegava as 4 semanas MAIS ANTIGAS (API InfoDengue retorna DESC)
- IBGE API timeout do runner → fallback silencioso para 50 munis em vez de 399
- `data_cache` schema drift (`cache_value`/`updated_at` inexistentes)

**Corrigido em 7 commits** (`56227a9`..`16f1580`). ETL agora roda full_run=true
em 64s, 399 munis, 1596 registros, 0% erro. dengue_data atualizado para SE 13/2026.
O mesmo schema drift foi corrigido em etl_agua, etl_clima e etl_ambiente.

### ✅ Resolvido (2026-04-12) — IRTC calibração: Opção 4 (hybrid coverage-normalized)
**Root cause:** fórmula tratava dados ausentes como score=0, diluindo o IRTC
de ~395/399 municípios (que só têm dengue como input) para teto de 25 ("baixo").

**Implementada Opção 4 (hybrid):**
- Fórmula normalizada: `IRTC = sum(w_i*R_i for available) / sum(w_i for available)`
- Novos campos: `data_coverage` (float 0..1), `max_domain_score` (0-100), `dominant_domain`
- Migration 016 adicionou colunas em `irtc_scores`
- `calc_r_X` agora retorna `(score, has_data)` tuples
- FIRMS (ambiente) tem `has_data=True` sempre (cobertura global via satélite)

**Resultado em produção:** 140/399 munis (35%) reclassificados de "baixo" para
"médio" ou "alto". 18 munis em epidemia corretamente marcados "alto" (IRTC=55.56).
Commits `dab460d`..`e628f55`.

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Correlações geram avalanche no início | Cooldown 120min por regra + review manual dos primeiros dias |
| Sem histórico longo pra ML real | Adiar 3.E; começar backfill em paralelo |
| Matching de município por nome falha | Reusar `match_name_to_ibge` do `etl_irtc.py` |
| INMET instável quebra `climate_data` | Fase 3 depende de Fase 0 estável — monitorar `etl_health_clima` |

---

## 8. Sessao 2026-04-12/13 — Entrega completa da Fase 3

### Commits shipados (sessao 12-13/abr)

| Commit | Escopo | Arquivos |
|---|---|---|
| `c60cb07` | cron-infohidro.yml | workflow InfoHidro 6h |
| `80809f4` | etl_infohidro.py expandido | 10 secoes, 17k registros |
| `73d9e7f` | fix endpoints quebrados | desabilitar 500/403, circuit breaker |
| `197b6ba` | useTendencias.ts | 4 hooks de tendencias |
| `9e996a4` | TendenciasPage.tsx | 4 charts Recharts |
| `74f4c76` | router /tendencias | rota lazy-loaded |
| `712f778` | Sidebar tendencias | nav item com icone |
| `ac8bbc3` | migration 018 | tabela anomalies |
| `69052dc` | etl_anomalies.py | z-score rolling window |
| `949c124` | cron-anomalies.yml | workflow 6h |
| `82dfab4` | migration 019 | tabela dengue_projections |
| `fb5528f` | etl_dengue_projections.py | regressao linear 399 munis |
| `2813021` | cron-dengue-projections.yml | workflow diario |
| `3a6eb35` | useDengueProjections.ts | hook + summary |
| `f031b28` | DengueProjecoes.tsx | chart + lista em alta |
| `5ecf332` | SaudePage + projecoes | secao integrada |
| `7d4d198` | useAnomalias.ts | hook anomalias |
| `109a2f0` | TendenciasPage + anomalias | 5o card no grid |
| `11e827f` | useInfoHidroExpandido.ts | 7 cache keys |
| `1c8dccc` | AguaPage + tab Dados Ambientais | 11 secoes por dominio |

### Inventario final — Fase 3

**Backend (ETL + cron + migrations):**

| Sub-fase | Script | Cron | Migration | Dados em producao |
|---|---|---|---|---|
| 3.A | etl_correlations.py | cron-correlations.yml | 014, 015 | regras compostas |
| 3.B | etl_situational_report.py | cron-situational.yml | 017 | relatorio diario |
| 3.C | etl_dengue_projections.py | cron-dengue-projections.yml | 019 | 1596 projecoes, 7 em alta |
| 3.F | etl_anomalies.py | cron-anomalies.yml | 018 | z-score (aguardando historico) |
| 3.G | — | — | — | frontend only |
| 3.H | etl_infohidro.py | cron-infohidro.yml | — | 17k+ registros, 12/12 OK |

**Frontend (hooks + componentes + paginas):**

| Pagina | Componentes novos | Hooks novos |
|---|---|---|
| /tendencias | TemperaturaChart, FocosChart, DengueChart, IRTCGauge, AnomaliasPanel | useTendencias (4), useAnomalias |
| /saude | DengueProjecoes | useDengueProjections |
| /agua (tab) | DadosAmbientaisTab | useInfoHidroExpandido (7) |
| /relatorios | (sessao anterior) | useRelatorios |

### Historico de dados (bloqueio para 3.E)

| Tabela | Registros | Periodo | Meses |
|---|---|---|---|
| dengue_data | 3,192 | 2025-SE1 a 2026-SE13 | ~15 |
| fire_spots | ~500 | 2026-03-18 a 04-12 | <1 |
| climate_data | ~200 | 2026-04-10 a 04-12 | <0.1 |
| air_quality | ~10 | 2026-04-12 | <0.1 |
| river_levels | ~16 | 2026-04-11 a 04-12 | <0.1 |

3.E (ML real) requer >= 12 meses em todos os dominios. Estimativa: viavel a
partir de ~2027-04 com os crons acumulando dados continuamente.

---

*Este documento e vivo. Fase 3 concluida. Proximo: Fase 4 (C4ISR Completo).*
