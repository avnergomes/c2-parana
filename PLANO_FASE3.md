# Plano de Implementação — Fase 3 (Intelligence)

**Versão:** 1.1
**Data:** 2026-04-08 (atualizado após sessão de execução)
**Status:** ✅ **3.A shipada e validada em produção** — fases B-G pendentes
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

### Fase 3.A — Correlações heurísticas simples ✅ Concluída

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

### Fase 3.B — Relatório Situacional Diário (tarefa 3.7 do plano original)

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

### Fase 3.C — Preditivo simples: Extrapolação de tendência de dengue

**Objetivo:** Primeiro modelo preditivo, mas ainda sem ML — apenas **projeção
linear** dos últimos 4 valores semanais, grosseira mas útil.

**Escopo:**
- Script que lê 8 semanas de `dengue_data` por município e projeta semana+4
  usando regressão linear simples (Python stdlib, sem scikit-learn).
- Armazena em `dengue_projections (ibge_code, projected_week, projected_cases,
  r_squared, calculated_at)`.
- Marca municípios com tendência de alta como candidatos a alerta preventivo.

**Nota:** O plano original fala em Prophet/ARIMA, mas começar com regressão
linear é mais rápido, testável, e dá baseline pra comparar quando migrar pra
ML real na Fase 3.E.

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

### Fase 3.F — Detecção de anomalias estatísticas (tarefa 3.6)

**Objetivo:** Flag automático de valores anômalos em séries temporais usando
z-score rolling window (sem ML).

**Escopo:**
- Script que, para cada indicador numérico (`temperature`, `humidity`, `aqi`),
  mantém uma janela rolante de 30 observações por município e calcula z-score
  da observação mais recente.
- `|z| > 3` dispara uma notification de anomalia.
- Simples mas pega casos que threshold fixo não pega (ex: temperatura "normal"
  pra Curitiba em março é anomalia em junho).

**Dependência:** nenhuma — independente.

---

### Fase 3.G — Painel de tendências no frontend (tarefa 3.8)

**Objetivo:** Visão gráfica consolidada das tendências de 72h para cada domínio,
no formato dashboard tipo "situation room".

**Escopo:**
- Nova rota `/tendencias` com gráficos Recharts mostrando:
  - Evolução da temperatura média estadual últimas 72h
  - Evolução de focos de incêndio últimas 7d (barras diárias)
  - Delta de casos de dengue semana a semana
  - Distribuição atual de IRTC por faixa (gauge)
- Dados via hooks reutilizando `useClima`, `useAmbiente`, etc.

**Dependência:** pode usar dados existentes sem esperar ML.

---

## 5. Ordem de execução recomendada

Pragmática, priorizando alavancagem de valor:

1. **3.A** — Correlações heurísticas (agora)
2. **3.D** — Fix de precipitação (desbloqueia regras hídricas na 3.A)
3. **3.B** — Relatório situacional diário (entrega visível pro operador)
4. **3.G** — Painel de tendências (UX)
5. **3.F** — Anomalias estatísticas (baseline antes de ML)
6. **3.C** — Projeção linear dengue (preditivo simples)
7. **3.E** — ML real (quando tiver histórico)

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

### 🔴 Aberto — `dengue_data` está obsoleta (~1 ano stale)
O `etl_saude.py` parou de atualizar em algum momento. A semana epidemiológica
mais recente em produção é `2025/4` (verificado em 2026-04-08). Ou seja, o
sistema está calculando IRTC e disparando regras de saúde com dados de **mais
de um ano atrás**. Bug de ETL silencioso pra investigar separadamente.

**Verificação:**
```sql
SELECT MAX(year) || '/' || MAX(epidemiological_week) FROM dengue_data;
-- Esperado: 2026/<semana atual>; Observado: 2025/4
```

**Possíveis causas a investigar:**
- Cron `cron-saude.yml` pausado/falhando silenciosamente nos GitHub Actions
- API InfoDengue mudou de formato/endpoint
- Bug no parser do ETL

### 🔴 Aberto — IRTC calibração: cap em 25 quando só dengue contribui
A fórmula `IRTC = 0.25*R_clima + 0.25*R_saude + 0.20*R_ambiente + 0.15*R_hidro + 0.15*R_ar`
tem um cap matemático: o R_saude máximo (100) sozinho contribui apenas
`0.25 * 100 = 25` — dentro da faixa "baixo" (0-25). Para um município entrar
em "médio" (26-50), "alto" (51-75) ou "crítico" (>75), **múltiplos domínios**
precisam contribuir simultaneamente.

Mas a cobertura real é desigual:
- Climate: ~12 estações INMET (cobertura mínima do PR)
- Fire spots: depende de eventos detectados pela NASA FIRMS (atualmente 2 no PR todo)
- River levels: 8 estações ANA
- Air quality: 4 cidades (capitais com AQICN)
- Dengue: 399 municípios (cobertura completa via InfoDengue)

**Resultado prático**: a maioria dos 399 municípios só tem dengue como input,
ficam travados em IRTC ≤ 25 (faixa "baixo") permanentemente. **O IRTCLayer no
mapa nunca mostra nada além de verde**, mesmo durante eventos extremos
isolados.

**Mitigações possíveis (a discutir com stakeholders):**
- Aumentar `W_saude` de 0.25 pra 0.40 (dengue sozinho pode chegar a 40)
- Capar agressivamente: epidemia → R_saude=200 truncado a 100
- Reformular pra "IRTC = max disponível" em vez de "IRTC = média ponderada"
- Estender cobertura das outras fontes (etl_clima cobrir mais estações INMET)
- Aceitar que "baixo" é o valor honesto até cobertura aumentar (calibrar o
  IRTC pra ser proporcional ao **% de risco máximo possível dado os dados
  disponíveis**, não ao máximo absoluto)

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Correlações geram avalanche no início | Cooldown 120min por regra + review manual dos primeiros dias |
| Sem histórico longo pra ML real | Adiar 3.E; começar backfill em paralelo |
| Matching de município por nome falha | Reusar `match_name_to_ibge` do `etl_irtc.py` |
| INMET instável quebra `climate_data` | Fase 3 depende de Fase 0 estável — monitorar `etl_health_clima` |

---

*Este documento é vivo. Atualizar após cada sub-fase entregue.*
