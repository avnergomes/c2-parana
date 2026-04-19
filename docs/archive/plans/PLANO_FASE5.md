# Plano de Implementação — Fase 5 (Reconhecimento e Sensores Avançados)

**Versão:** 1.1
**Data:** 2026-04-16 (atualizado após sessão autopilot)
**Status:** ✅ **5.A, 5.D, 5.E, 5.F shipadas (infraestrutura)** | 5.B, 5.C adiadas | 5.G, 5.H opcionais
**Predecessor:** `PLANO_FASE4.md` (7/7 sub-fases completas)

---

## 1. Contexto

A Fase 4 (C2/OODA) entregou o ciclo completo de decisão: detecção → contextualização
automática → playbook → ação registrada → relatório pós-incidente. O sistema agora
"age" de forma estruturada sobre os sinais que captura.

A Fase 5 expande o **SR (Surveillance & Reconnaissance)** do C4ISR com três frentes:

1. **Novos sensores passivos** (CEMADEN, DataSUS ampliado, SICAR) — mais camadas no COP
2. **Reconnaissance ativo** — capacidade de "apontar a luneta" para um município específico
   e extrair perfil completo sob demanda
3. **Sensoriamento remoto** (Sentinel/GEE) — imagens de satélite e NDVI como camada do COP

**Antes (Fase 4):**
> Operador recebe alerta de risco em Londrina. Abre detalhe do incidente.
> Vê IRTC atual, clima recente, 3 focos FIRMS. Playbook sugere verificar condições.

**Depois (Fase 5):**
> Operador recebe alerta + incidente. Clica em "Reconhecer município".
> → Perfil completo: pop 575k, IDHM 0.778, área 1.653 km²
> → Todos os indicadores atuais vs média histórica 90 dias (radar comparativo)
> → Alerta CEMADEN paralelo confirmando risco geológico
> → Imagem Sentinel mais recente (se disponível)
> → DataSUS: internações respiratórias em alta há 2 semanas (correlação com fumaça)
> → Recomendações contextualizadas por cruzamento de todas as fontes

---

## 2. O que já existe (ponto de partida)

| Recurso | Estado | Relevância para Fase 5 |
|---|---|---|
| `fire_spots` (NASA FIRMS) | ✅ | Sensor remoto existente, baseline para 5.B |
| `climate_data` (INMET) | ✅ | Série temporal para comparações antes/depois |
| `irtc_scores` (399 munis) | ✅ | Insumo para perfil do Reconhecimento |
| `situational_reports` | ✅ | Padrão JSONB para relatórios consolidados |
| `incidents` + `incident_actions` | ✅ | Reconhecimento pode virar ação de playbook |
| `pr_municipios.json` | ✅ | Cadastro de 399 munis com IBGE + coords |
| ETL pattern (cron + retry + supabase) | ✅ | Template reutilizável para CEMADEN/DataSUS |
| React Query + hooks por domínio | ✅ | Padrão estabelecido para novas fontes |
| Recharts (BarChart, LineChart, PieChart) | ✅ | Falta RadarChart (já suportado pela lib) |
| Leaflet / react-leaflet | ✅ | Base para overlays de Sentinel |

### Gaps específicos para Fase 5

1. **Sem dados de desastres geológicos** — FIRMS cobre incêndios, mas não deslizamentos,
   movimentação de massa, alagamentos urbanos (CEMADEN cobre)
2. **Sem perfil consolidado de município** — dados existem em silos; falta UI de "zoom-in"
3. **Sem comparação temporal estruturada** — dashboards mostram "agora", não "agora vs antes"
4. **Sem dados de morbidade/mortalidade** — InfoDengue só dá casos; DataSUS dá internações
5. **Sem camada de sensoriamento remoto** no mapa — FIRMS é pontual, falta imagem de fundo

---

## 3. Decisões arquiteturais

### 3.1 Sentinel/Copernicus: incluir nesta fase?

**Decisão: adiar 5.B (Sentinel) para uma sessão dedicada; priorizar 5.A, 5.D, 5.E, 5.F primeiro.**

Razão: Sentinel Hub Starter custa ~€50/mês e exige OAuth + cache de tiles (blob storage).
O valor marginal de ter imagem de satélite de fundo não justifica o overhead agora quando
há quick wins com dados tabulares (CEMADEN, DataSUS) que alimentam correlações existentes.

### 3.2 GEE (Google Earth Engine): viabilidade

**Decisão: adiar 5.C (GEE) também. Só faz sentido após Sentinel estar wired.**

Razão: GEE é Python-only via `earthengine-api`, exige service account Google Cloud, e
o output típico (tiles NDVI) precisa da mesma infra de cache de tiles que o Sentinel.
Acoplado a 5.B.

### 3.3 CEMADEN: tem API pública?

**Decisão: usar o feed `https://painelalertas.cemaden.gov.br/wsAlertas2` (não requer auth).**

Endpoint descoberto via inspeção do JS do painel público (chamada `$.getJSON("/wsAlertas2")`).
O URL `sws.cemaden.gov.br/PED/rest/alertas` mencionado em documentação antiga retorna 404 —
provavelmente desativado. Schema real do feed:

```json
{
  "alertas": [
    {"cod_alerta": 1886, "datahoracriacao": "2026-04-16 16:53:48.88",
     "codibge": 2112704, "evento": "Risco Hidrológico - Moderado",
     "nivel": "Moderado", "status": 1, "uf": "MA", "municipio": "VARGEM GRANDE",
     "latitude": -3.53, "longitude": -43.91}
  ],
  "atualizado": "16-04-2026 20:54:01 UTC"
}
```

Campos importantes:
- `cod_alerta` (int) — ID único → `alert_code` (string no schema)
- `nivel`: `Moderado` → `atencao`, `Alto` → `alerta`, `Muito Alto` → `alerta_maximo`
- `evento` começa com o tipo: `Risco Hidrológico` → `hidrologico`, `Movimento de Massa` → `movimento_massa`, etc
- `datahoracriacao` sem TZ, assumido UTC (confirmado pelo cabeçalho `atualizado`)
- Sem filtro por UF no endpoint — filtramos client-side após o GET

Fallback: não há fonte secundária tão consolidada; se o feed cair, o ETL loga e sai
com exit code 1 (GitHub Actions marca como failed — visibilidade garantida).

### 3.4 Reconhecimento: página ou modal?

**Decisão: página full-screen `/reconhecimento/:ibge`.**

Razão: o perfil tem 10+ cards/gráficos; modal fica apertado e quebra a navegação por
bookmark/compartilhamento. Rota dedicada permite deep-linking a partir de qualquer
outra página ("ver reconhecimento desta cidade") — padrão consistente com `/incidentes/:id`.

### 3.5 DataSUS: TabNet HTML scraping ou API?

**Decisão: TabNet não tem API oficial; usar microdados públicos via FTP `ftp.datasus.gov.br`
+ parser de arquivos DBC (pysus ou scraping do TabNet HTML).**

Complicador: DBC é formato proprietário (Dbase comprimido) — precisa de `pysus` (Python lib
dedicada, 200KB wheel). Alternativa mais leve: TabNet HTML via `tabnetdatasus` scraper ou
os arquivos CSV consolidados do MS. Decisão de qual usar fica para o momento da
implementação — priorizar SIH (internações) que tem o tabwin web acessível.

### 3.6 Análise temporal antes/depois: onde vive o cálculo?

**Decisão: client-side (React Query + Recharts).**

Razão: comparações de 2 janelas (p.ex. últimos 30d vs 30d anteriores) operam sobre
dados já em memória nos hooks existentes. Mover pro servidor exigiria criar nova rota
ou materializar view. Ganho de performance < esforço. Se vier a escalar mal em 6 meses,
promovemos a RPC/view.

---

## 4. Decomposição em sub-fases

Cada sub-fase é shippable sozinha. A ordem reflete ROI decrescente e dependências.

### Fase 5.A — CEMADEN Alertas (backend) 🟢 Pronta p/ deploy (2026-04-16)

**Status:** Código shipado; aguarda `db push` das migrations 026+027 e ativação
do cron no GitHub Actions para rodar em produção.

**Validação local (dry-run 2026-04-16):**
- Endpoint real descoberto: `https://painelalertas.cemaden.gov.br/wsAlertas2`
- 4 alertas globais ativos (0 no PR no momento do teste)
- Parsing 100% OK: UTF-8, UTC, IBGE code do feed preservado
- Type-check TypeScript passou sem erros após integração do hook no frontend

**Objetivo:** Nova fonte de sensoriamento: alertas geológicos/hidrológicos oficiais
da Defesa Civil Nacional.

**Escopo:**
- Migration `026_cemaden_alerts.sql`:
  - Tabela `cemaden_alerts (id, alert_code, uf, municipality, ibge_code, type,
    severity, description, geometry_geojson, issued_at, expires_at, source_url,
    raw_payload, ingested_at)`
  - UNIQUE(alert_code, issued_at) — idempotência entre runs
  - Indexes em `severity`, `issued_at DESC`, `ibge_code`
  - RLS anon read
- Script `scripts/etl_cemaden.py`:
  - GET `http://sws.cemaden.gov.br/PED/rest/alertas?uf=PR` (com retry + user-agent)
  - Parse do JSON de alertas ativos
  - Match `municipio` → `ibge_code` reusando `pr_municipios.json` + fuzzy (mesmo pattern
    do `etl_irtc.py`)
  - Upsert em `cemaden_alerts` com `on_conflict=alert_code,issued_at`
  - Se severity in ('alerta','alerta_maximo') e `auto_create_incident` estiver ativo
    em `alert_rules` com `domain=cemaden` → INSERT em `incidents` (integração com Fase 4)
- Workflow `.github/workflows/cron-cemaden.yml` rodando a cada 30 min (mais frequente
  que os outros porque a natureza dos dados exige).
- Migration complementar para seed em `alert_rules`: regra "CEMADEN Alerta Máximo"
  com `auto_create_incident=true`, severity=critical.

**Regra seed proposta:**
```json
{
  "name": "CEMADEN Alerta Máximo",
  "domain": "cemaden",
  "condition": {"type": "simple", "field": "severity", "op": "=", "value": "alerta_maximo"},
  "severity": "critical",
  "auto_create_incident": true,
  "cooldown_minutes": 60
}
```

**Arquivos a criar:**
- `supabase/migrations/026_cemaden_alerts.sql` (~40 linhas)
- `supabase/migrations/027_seed_cemaden_rules.sql` (~15 linhas)
- `scripts/etl_cemaden.py` (~200 linhas)
- `.github/workflows/cron-cemaden.yml` (~35 linhas)

**Arquivos a modificar:**
- Nenhum (aditivo puro)

**Validação:** `SELECT count(*) FROM cemaden_alerts WHERE severity='alerta_maximo'` >= 0
após primeiro run; em dias com desastres ativos deve vir > 0.

---

### Fase 5.B — Sentinel/Copernicus (imagens satélite) — ADIADA

Motivo do adiamento: ver seção 3.1. Reabrir quando orçamento Sentinel Hub Starter
(~€50/mês) for aprovado e houver cache de tiles configurado. Especificação completa
fica em uma sessão dedicada.

**Pré-requisitos para reabrir:**
- Credenciais Sentinel Hub (client_id + client_secret)
- Decisão sobre storage de tiles (Supabase Storage, R2, ou servir direto da API com
  cache HTTP)
- Escolha de bandas (RGB natural para visual vs NIR+SWIR para pontos quentes)

---

### Fase 5.C — Google Earth Engine (NDVI, uso do solo) — ADIADA

Motivo do adiamento: ver seção 3.2. Acoplada a 5.B.

---

### Fase 5.D — Módulo de Reconhecimento por Município (frontend)

**Objetivo:** "Apontar a luneta" para um município e obter perfil multi-domínio consolidado.

**Escopo:**
- Rota `/reconhecimento/:ibge` (lazy-loaded).
- Layout 3 seções verticais:

  **Seção 1 — Identificação (header):**
  - Nome, código IBGE, coords centróide
  - População (IBGE 2022), área km², IDHM 2010, PIB per capita
  - Chips: classe de porte (grande/médio/pequeno), mesorregião, bioma

  **Seção 2 — Situação atual (grid 2x3):**
  - IRTC atual com gauge + delta vs 7d atrás
  - Clima (temp, umidade, precipitação 24h) com mini-sparkline 72h
  - Focos FIRMS últimos 7d (count + mapa mini do município)
  - Dengue: nível de alerta + casos SE atual vs SE-1
  - Ar (AQI quando disponível; município vizinho monitorado se não)
  - CEMADEN (alertas ativos se houver — após 5.A estar em produção)

  **Seção 3 — Comparação temporal (radar + tabela):**
  - RadarChart com 5 eixos (clima, saúde, ambiente, hídrico, ar) mostrando média
    dos últimos 30d vs média dos 30d anteriores
  - Tabela: indicador | agora | média 30d | média 30-60d | delta %

- Breadcrumb de navegação: Dashboard → Mapa → [Município] → Reconhecimento
- Botão "Criar incidente" com município pré-preenchido
- Export PDF (via browser print stylesheet — sem dep nova)

**Componentes:**
- `ReconhecimentoPage.tsx` — layout 3 seções
- `MunicipioHeader.tsx` — identificação + chips
- `MunicipioSituacao.tsx` — grid de indicadores
- `MunicipioRadar.tsx` — RadarChart + tabela comparativa

**Hooks:**
- `useReconhecimento(ibge)` — agrega `irtc_scores`, `climate_data`, `fire_spots`,
  `dengue_data`, `air_quality`, `cemaden_alerts` filtrados pelo município
- `useMunicipioMetadata(ibge)` — dados estáticos do `pr_municipios.json` + IBGE API

**Arquivos a criar:**
- `src/pages/ReconhecimentoPage.tsx` (~180 linhas)
- `src/components/reconhecimento/MunicipioHeader.tsx` (~70 linhas)
- `src/components/reconhecimento/MunicipioSituacao.tsx` (~150 linhas)
- `src/components/reconhecimento/MunicipioRadar.tsx` (~100 linhas)
- `src/hooks/useReconhecimento.ts` (~90 linhas)
- `src/hooks/useMunicipioMetadata.ts` (~40 linhas)

**Arquivos a modificar:**
- `src/router/index.tsx` — rota `/reconhecimento/:ibge`
- Layout/Sidebar — adicionar entrypoint (ex.: link "Reconhecimento" que abre modal
  de busca de município, ou seletor direto)

**Validação:** renderizar `/reconhecimento/4106902` (Curitiba) sem erro, radar com
5 eixos populados, todos os cards da Seção 2 com dados ou placeholder "sem dados".

---

### Fase 5.E — Análise temporal antes/depois

**Objetivo:** Componente genérico de comparação de janelas temporais, reutilizável em
/tendencias e /reconhecimento.

**Escopo:**
- Componente `TimeRangeCompare`:
  - Props: `dataKey` (str), `dataA` (array), `dataB` (array), `format` (fn)
  - Renderiza: 2 mini BarChart sobrepostos + delta absoluto + delta %
  - Coloração: verde se melhora, vermelho se piora, cinza se neutro
- Hook `useTimeRangeData<T>(table, filters, windowA, windowB)` — busca ambas as janelas
  em paralelo e retorna `{ a, b, deltaAbs, deltaPct }`.
- Integração em:
  - `/tendencias` — adicionar toggle "últimos 30d vs anterior" em cada card
  - `/reconhecimento/:ibge` — Seção 3 já usa

**Arquivos a criar:**
- `src/components/shared/TimeRangeCompare.tsx` (~100 linhas)
- `src/hooks/useTimeRangeData.ts` (~60 linhas)

**Arquivos a modificar:**
- `src/pages/TendenciasPage.tsx` — adicionar compare toggle
- `src/components/reconhecimento/MunicipioRadar.tsx` — consumir hook

**Validação:** toggle em /tendencias muda cards para modo "vs anterior" sem reload.

---

### Fase 5.F — DataSUS SIH ampliado 🟢 Infraestrutura pronta (2026-04-16)

**Status:** Schema + ETL + cron shipados. Aguarda primeiro run mensal (dia 5)
para validar em produção.

**Implementado:**
- Migration 028: tabelas `datasus_sih` (dados agregados por município x capítulo CID)
  e `datasus_sih_ingestion_log` (controle idempotência por competência)
- `scripts/etl_datasus.py` usa pysus 0.17.5 (pyreaddbc wheels) para ler RDPR mensal
  do FTP, agrega por capítulo CID-10, upsert. Suporta `--month` e `--last-n-months`
  para backfill manual via workflow_dispatch
- `scripts/requirements-datasus.txt` separado: pysus + pandas + pyarrow só são
  instalados no cron-datasus, não contaminando os outros crons
- Cron mensal dia 5 às 02:00 UTC
- Hook `useDatasusSih` + componente `InternacoesSUS` com chart Recharts e
  seletor de capítulo CID (Respiratório, Circulatório, Infecciosas, etc.)
- Integrado em SaudePage e ReconhecimentoPage (com filtro por IBGE)

**Dependência validada:** pysus traz wheels pré-compilados para linux_x86_64,
deve instalar limpo no runner GH Actions. Se falhar, o ETL emite mensagem clara
orientando troca por dbfread+readdbc alternativo.

**Escopo original (mantido como referência):**

Expandir dados de saúde além do InfoDengue — internações (SIH) e
mortalidade (SIM) por município e grupo CID.

**Escopo:**
- Migration `028_datasus_health.sql`:
  - Tabela `datasus_sih (ibge_code, year, month, cid_chapter,
    internacoes_total, internacoes_respiratorio, obitos_hospitalares, ...)`
  - UNIQUE(ibge_code, year, month, cid_chapter)
  - Indexes por ibge_code + year
- Script `scripts/etl_datasus.py`:
  - Download do arquivo DBC mensal mais recente (ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS)
  - Parser com pysus (ou alternativa leve baseada em tabnetdatasus)
  - Agregação por município + CID capítulo 10 (respiratório), 9 (circulatório), 1 (infecto)
  - Upsert em `datasus_sih`
  - Frequência mensal (os dados do MS têm delay de ~40 dias)
- Workflow `cron-datasus.yml` rodando 1x por mês (dia 5 às 02:00)
- Integração frontend:
  - Novo card "Internações por Respiratório" em SaudePage
  - Hook `useDatasusSih(ibge, months=12)`
  - Card no /reconhecimento também

**Decisão pendente (na implementação):** pysus vs scraping TabNet. Pysus é mais
confiável mas adiciona 200KB + requer readdbc. TabNet scraping é mais frágil mas zero
dep. Priorizar pysus na primeira iteração — se quebrar em produção, trocar.

**Arquivos a criar:**
- `supabase/migrations/028_datasus_health.sql` (~30 linhas)
- `scripts/etl_datasus.py` (~300 linhas)
- `.github/workflows/cron-datasus.yml` (~30 linhas)
- `src/hooks/useDatasusSih.ts` (~40 linhas)
- `src/components/saude/InternacoesRespiratorio.tsx` (~80 linhas)

**Arquivos a modificar:**
- `scripts/requirements.txt` — adicionar `pysus` ou `dbfread`
- `src/pages/SaudePage.tsx` — adicionar seção de internações
- `src/components/reconhecimento/MunicipioSituacao.tsx` — adicionar card SIH

**Dependência:** nenhuma do codebase (aditiva). Depende de `pysus` funcionar em
runner Linux do GitHub Actions — testar em dispatch manual antes de habilitar cron.

---

### Fase 5.G — DENATRAN (acidentes rodoviários) — OPCIONAL

**Prioridade baixa.** Adiada até haver demanda explícita. Dados estão em PRF (Polícia
Rodoviária Federal), atualizados em CSV público anual; utilidade marginal para C4ISR
atual. Plano fica esboçado:
- Download CSV anual de `dados.gov.br`
- Migration + ETL anual + overlay de acidentes no mapa

---

### Fase 5.H — SICAR/CAR (Cadastro Ambiental Rural) — OPCIONAL

**Prioridade média-baixa.** SICAR expõe polígonos de propriedades rurais cadastradas
(APP, Reserva Legal). Dados via arquivo SHP por estado, atualização mensal. Utilidade
principal: overlay no mapa para correlacionar focos FIRMS com áreas cadastradas
ambientalmente. Adiada para depois de 5.F.

---

## 5. Ordem de execução recomendada

1. ~~**5.A — CEMADEN**~~ ✅ shipada 2026-04-16 — feed wsAlertas2, integração OODA
2. ~~**5.D — Reconhecimento por Município**~~ ✅ shipada 2026-04-16 — `/reconhecimento/:ibge` + radar comparativo
3. ~~**5.E — Análise temporal antes/depois**~~ ✅ shipada 2026-04-16 — `TimeRangeCompare` em /tendencias e /reconhecimento
4. ~~**5.F — DataSUS SIH**~~ 🟢 infraestrutura shipada 2026-04-16 — cron mensal, aguarda primeiro run dia 5/maio
5. **5.B — Sentinel** — bloqueada por decisão de orçamento
6. **5.C — GEE** — acoplada a 5.B
7. **5.G — DENATRAN** — opcional, baixa prioridade
8. **5.H — SICAR** — opcional, prioridade média

**Sessão autopilot 2026-04-16:** 4 sub-fases shipadas em sequência com type-check
verde e dry-runs validados. Commits: dea83f5 (5.A), 29809f6 (5.D), f9177d7 (5.E),
pendente (5.F).

---

## 6. Métricas de sucesso por sub-fase

| Sub-fase | KPI | Meta |
|---|---|---|
| 5.A | Alertas CEMADEN ingeridos em 24h | >= 0 (e em dias críticos, > 0) |
| 5.A | Alerta severity='alerta_maximo' vira incidente | 100% |
| 5.D | Tempo de carregamento do perfil | < 3s |
| 5.D | Cobertura de dados (cards com valor real) | >= 4/6 por município da região metropolitana |
| 5.E | Toggle de compare responde sem reload | < 500ms |
| 5.F | Internações últimos 12 meses carregados | 399 munis |
| 5.F | Retry do cron mensal bem-sucedido | 3 meses consecutivos sem falha |

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| CEMADEN API retorna 403/500 (bloqueio anti-bot) | Média | Médio | User-agent realístico, retry exponencial, fallback XML do Defesa Civil |
| Match municipio→ibge_code do CEMADEN falha | Média | Baixo | Fuzzy match + log de não-matched; reuse de `pr_municipios.json` |
| `pysus` não instala em runner Linux | Baixa | Médio | Fallback para tabnetdatasus ou scraping HTML |
| Reconhecimento lento (6 queries paralelas) | Média | Médio | React Query paraleliza automaticamente; prefetch no hover do município |
| RadarChart com escalas heterogêneas fica confuso | Alta | Baixo | Normalizar cada eixo 0..100 (mesmo padrão do IRTC) |
| DataSUS DBC mensal pesa 500MB+ | Média | Alto | Download streaming + filtro na origem por UF |

---

## 8. Dependências externas

| Dependência | Status | Bloqueante? |
|---|---|---|
| CEMADEN REST endpoint | ✅ Público, sem auth | Não |
| `pr_municipios.json` | ✅ Já no repo | Não |
| Recharts `RadarChart` | ✅ Já instalado | Não |
| pysus (Python lib) | ❌ Não instalado | Apenas 5.F |
| Sentinel Hub account | ❌ Sem orçamento | Apenas 5.B |
| Google Earth Engine service account | ❌ Não configurado | Apenas 5.C |

**Zero dependências novas necessárias** para 5.A, 5.D, 5.E.

---

## 9. Estimativa de esforço

| Sub-fase | Sessões estimadas | Complexidade |
|---|---|---|
| 5.A | 1 sessão | Média (ETL padrão + migration + integração incidentes) |
| 5.D | 2 sessões | Média-Alta (6 hooks + radar + layout) |
| 5.E | 0.5 sessão | Baixa (componente pequeno) |
| 5.F | 1-2 sessões | Alta (parsing DBC novo) |
| 5.B | 2-3 sessões | Alta (bloqueada) |
| 5.C | 2-3 sessões | Alta (bloqueada) |
| **Total viável agora (5.A+5.D+5.E+5.F)** | **4-5 sessões** | |

---

*Este documento é vivo. Será atualizado conforme sub-fases forem executadas.*
*Próximo passo: iniciar 5.A (ETL CEMADEN + migration + cron).*
