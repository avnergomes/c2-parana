# C2 PARANÁ — PLANO DE CORREÇÃO COMPLETO
## Prompts para Claude Code — v2 (01/03/2026)

---

## Ordem de Execução (IMPORTANTE!)

```
1️⃣  [BANCO]   06-corrigir-constraints-banco.md    → Executar SQL no Supabase Dashboard PRIMEIRO
2️⃣  [FRONT]   00-desabilitar-paywall.md            → Desabilitar paywall para poder testar
3️⃣  [ETL]     01-corrigir-etl-clima.md             → Dados meteorológicos (core do sistema)
4️⃣  [ETL]     02-corrigir-etl-ambiente.md           → Focos, rios, qualidade do ar
5️⃣  [ETL]     03-corrigir-etl-saude.md              → Dengue (reescrita completa)
6️⃣  [ETL]     04-corrigir-etl-agro.md               → VBP, comércio exterior, crédito rural
7️⃣  [ETL]     05-estabilizar-etl-legislativo.md     → ALEP (retry + estabilidade)
```

---

## Passo a Passo Detalhado

### Passo 0: Verificar/Configurar Secrets do GitHub
Antes de tudo, ir em `github.com/avnergomes/c2-parana` → Settings → Secrets and variables → Actions.
Confirmar que TODOS existem:
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ⚠️ `NASA_FIRMS_KEY` — Se não existe, obter grátis em https://firms.modaps.eosdis.nasa.gov/api/area/
- ⚠️ `WAQI_TOKEN` — Se não existe, obter grátis em https://aqicn.org/data-platform/token/

### Passo 1: Executar SQL no Supabase
Copiar o SQL do arquivo `06-corrigir-constraints-banco.md` e executar no Supabase Dashboard → SQL Editor.
Isso cria as UNIQUE constraints necessárias para os upserts dos ETLs.

### Passo 2: Aplicar Prompts no Claude Code
Abrir o Claude Code no repo c2-parana e colar cada prompt na sequência. Cada prompt:
1. Explica o problema
2. Mostra o código atual exato
3. Dá o código corrigido
4. Inclui comando de commit

### Passo 3: Disparar ETLs Manualmente
Após fazer push das correções, ir em GitHub → Actions e disparar manualmente:
1. "ETL Clima (INMET)" → Run workflow
2. "ETL Meio Ambiente" → Run workflow
3. "ETL Saúde" → Run workflow (com full_run=false)
4. "ETL Agro" → Run workflow
5. "ETL Legislativo" → Run workflow (de preferência em horário comercial BRT)

### Passo 4: Verificar Dados no Supabase
Ir no Supabase Dashboard → Table Editor e verificar:
| Tabela | Esperado após correção |
|--------|----------------------|
| `climate_data` | ~24 registros (12 estações × 2 medições) |
| `fire_spots` | Variável (depende de queimadas ativas no PR) |
| `air_quality` | 4 registros (Curitiba, Londrina, Maringá, Foz) |
| `river_levels` | 8 registros (8 estações fluviométricas) |
| `dengue_data` | ~200 registros (50 municípios × 4 semanas) |
| `data_cache` | 5 registros (vbp_kpis, vbp_municipios, comex, emprego, credito) |
| `legislative_items` | >0 (se API ALEP estiver no ar) |

### Passo 5: Testar o App
Acessar https://avnergomes.github.io/c2-parana/
Login com `teste@teste.com` / `teste123456`
Navegar por todos os módulos — devem mostrar dados reais.

---

## Resumo dos Problemas e Soluções

| # | Problema | Causa | Solução |
|---|----------|-------|---------|
| 0 | Todas as páginas redirecionam para /pricing | Trial expirado + ProtectedRoute bloqueia | Desabilitar checagem de subscription temporariamente |
| 1 | ETL Clima roda mas 0 dados | API INMET retorna vazio OU filtro muito restritivo | Ampliar janela temporal + relaxar filtro + logs detalhados |
| 2 | ETL Ambiente falha com exit code 1 | Crash em cascata (FIRMS→AQICN→ANA) + sem UNIQUE constraint em river_levels | Isolar cada seção + fallbacks + tratar constraints |
| 3 | ETL Saúde timeout (6min35s) | 399 requests sequenciais sem rate limiting | Reduzir para top 50 + sleep entre requests + circuit breaker |
| 4 | ETL Agro nunca rodou | Cron semanal, nunca chegou segunda-feira | Disparar manualmente + proteger com try/except |
| 5 | ETL Legislativo intermitente | API ALEP instável, sem retry | Retry exponencial + HTTPS + horário comercial |
| 6 | UNIQUE constraints faltantes | Migrations 004/005 não aplicadas + river_levels sem constraint | SQL para criar todas as constraints de uma vez |
