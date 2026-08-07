# Próxima sessão — onde paramos

**Última sessão:** 2026-08-06 → 2026-08-07
**Contexto curto:** migração dos ETLs do GitHub Actions para Supabase
(Edge Functions + pg_cron). **Fases 0 e 1 concluídas e em produção.** Restam as
Fases 2 a 4 (16 pipelines).

> Leia primeiro: [`PLANO_MIGRACAO_SUPABASE.md`](./PLANO_MIGRACAO_SUPABASE.md)
> (gitignored, só no disco — é a especificação completa, com diário de
> implementação na seção 11) e [`../STATUS.md`](../STATUS.md).
> Este arquivo é só o "continue de onde paramos".

**Motivação:** em 2026-08-06 o GitHub Actions teve outage major (~3 h, nenhum job
conseguia runner). Todos os ETLs agendados pararam; os dois já migrados
(aviação, clima) seguiram rodando. Frescor de dado é o produto do DataGeo PR,
então o Actions como agendador é ponto único de falha.

---

## ✅ Entregue e verificado em produção (10 commits, `bc33c70`..`9fb7036`)

### Fundação
| Arquivo | O quê |
|---|---|
| `supabase/functions/_shared/etl.ts` | Client de service role, health record, `upsertCache`, `batchUpsert` com retry, `fetchWithRetry`/`fetchJson`/`fetchText` (UTF-8 explícito), `pooledMap` (substitui `ThreadPoolExecutor`), `assertEtlToken`, envelope `runEtl` |
| `supabase/functions/_shared/pr_municipios.ts` | 399 municípios do PR + `stripAccentsLower`/`buildNameLookup`. Edge Function não tem filesystem e não existe tabela de municípios no banco |
| `docs/templates/etl_pgcron.sql.tmpl` | Template de migration pg_cron |
| migration 034 | Schema `etl`, `etl.trigger_headers()` (token vem do Vault), `etl.expected_cadence` (22 pipelines), views `public.etl_freshness` / `public.etl_stale` |
| migrations 035, 036 | Correções da 034 — ver "erros que cometi" abaixo |
| migrations 037, 038 | Crons da Fase 1 e reagendamento de aviação/clima com o header do token |

### Pipelines migrados (5 em Supabase + pg_cron)
`aviacao`, `clima`, `escalation`, `alerts`, `cemaden`.

Verificado ponta a ponta em `cron.job_run_details` — **os 5 jobs dispararam pelo
pg_cron e concluíram `succeeded`**:

| Job | Disparo | Status |
|---|---|---|
| `etl-aviacao-every-minute` | 09:07, 09:08, 09:09 | succeeded (4 min após o deploy, `success` com 29 registros) |
| `etl-clima-every-15min` | 09:15:00 | succeeded |
| `etl-escalation` | 09:15:00 | succeeded |
| `etl-alerts` | 09:30:00 | succeeded |
| `etl-cemaden` | 09:30:00 | succeeded |

Estado em `public.etl_freshness` às 09:33 — todos `runtime = supabase-edge` e
`is_stale = false`:

```
aviacao       0 min   success
alerts        3 min   success
cemaden       3 min   empty     ← correto: 0 alertas ativos no PR
clima         3 min   success
escalation    3 min   success
```

O `last_status: null` de `alerts` (artefato do dual-run com o Python) se
resolveu sozinho assim que a Edge Function sobrescreveu o health record com um
objeto jsonb de verdade.

### Bugs de produção corrigidos no caminho
| ETL | O quê |
|---|---|
| `etl_dengue_projections.py` | **108 dias sem gravar, reportando `success`.** Três defeitos: `now_iso` com `+00:00` interpolado cru na URL do DELETE (o `+` vira espaço → 400), `on_conflict` sem `resolution=merge-duplicates` (POST era INSERT puro → 409), e mensagem de sucesso fora do `if`. Corrigido + `_write_health()`. Rodado de verdade: 1596 projeções, UTF-8 íntegro |
| `etl_anomalies.py` | Mesmo bug de `merge-duplicates` (ainda não tinha mordido) + `_write_health()`. Auditoria dos 23 ETLs: só estes dois tinham o defeito |
| migration 033 | Usava `uuid_generate_v4()` sem a extensão; nunca tinha sido aplicada. Trocado por `gen_random_uuid()` |
| `etl-cemaden` (porte) | `titleCase` com `\w` ASCII produzia "ÂNgulo" e "Diamante D'oeste" — municípios reais do PR |

---

## ⏭️ Próximo passo (ordem sugerida)

### Passo 1 — Fechar o cutover da Fase 1 (após 24-48 h de observação)
Passos 1 a 6 do checklist do plano estão feitos e verificados. Falta só deixar o
tempo passar (passo 7) e então desligar o Actions (passo 8).

Só depois que `select * from public.etl_stale;` estiver limpo para os 5 migrados
por 24-48 h:

remover o bloco `schedule` de `cron-escalation.yml`, `cron-alerts.yml` e
`cron-cemaden.yml`, renomear para "... (BACKUP)", manter `workflow_dispatch`.
`cron-aviacao.yml` e `cron-clima.yml` já estão nesse padrão.

> **Não pular.** Regra de ouro do plano: nunca desligar o Actions antes da
> validação e do período de observação.

### Passo 2 — AISStream (bloqueia `etl-maritimo`)
`maritime_traffic` não recebe linha desde 2026-08-02. Diagnóstico conclusivo:
com bbox do **mundo inteiro** a AISStream entrega **zero frames**, com
subscription aceita e sem frame de erro. Conta cortada em silêncio, não é código.

Para reproduzir depois de mexer na conta:
```bash
curl -X POST "$SUPABASE_URL/functions/v1/etl-maritimo?bbox=world&window=30&dry=1" \
  -H "x-etl-token: $ETL_TRIGGER_TOKEN"
```
`dry=1` não escreve nada. Se voltar a receber frames, agendar o cron `*/10`.

### Passo 3 — Fase 2 (6 pipelines DB→DB e feeds leves)
`correlations`, `noticias`, `anomalies`, `irtc`, `dengue`, `situational`.
Notas de porte na seção 6 do plano. Seguir o checklist da seção 8 para cada um.

### Passos 4 e 5 — Fases 3 e 4
Fase 3: `agua`, `ambiente`, `infohidro`, `healthcare`, `legislativo`, `saude`.
Fase 4: `agro` + spike de PDF do GETEC (timebox 1 h, seção 6 do plano).

---

## 🧠 Decisões de design importantes (não reabrir sem motivo)

- **Health record é sempre gravado, com campo `status`** — os scripts Python
  deletavam em caso de sucesso (presença = falha). Gravar sempre dá frescor
  observável, que é o que `etl_freshness` consome.
- **Frescor vem de três origens**: health record, sources em `data_cache` e
  tabela de domínio. Quatro pipelines (noticias, dengue, anomalies, datasus) não
  passam por `data_cache`; medir só por lá gerava falso positivo.
- **Token de disparo no Vault**, lido por `etl.trigger_headers()`. Nenhum segredo
  em SQL versionado. A migration 032 tinha a anon key hardcoded em texto claro;
  a 038 eliminou isso.
- **`assertEtlToken` falha aberto se `ETL_TRIGGER_TOKEN` não estiver definido.**
  Deliberado, para o rollout não quebrar funções agendadas antes do secret
  existir. Hoje o secret existe, então tudo exige o header.
- **`etl-alerts` diverge do Python em 3 pontos**, todos justificados no cabeçalho
  do `index.ts`: fetch único em vez de N queries, `metadata` como objeto jsonb
  (o Python fazia `json.dumps` numa coluna jsonb, o que grava uma *string*), e
  criação de incidente por insert + 23505 (o índice de dedup é **parcial**, e
  `ON CONFLICT` não infere índice parcial via PostgREST).
- **Lógica pura em `parse.ts`** quando houver parsing não-trivial (padrão do
  `etl-cemaden`): permite validar contra a fonte real sem deploy.

## ⚠️ Armadilhas conhecidas

- **Ordem obrigatória ao trocar uma função que já tem cron:** aplicar a migration
  que reagenda o job com `etl.trigger_headers()` **antes** do
  `functions deploy`. O contrário derruba o pipeline (401).
- **`db push` é bloqueado para o agente** pelo classificador de permissões.
  Deploy de Edge Function, `secrets set` e leituras pela Management API passam.
  Escrever a migration e pedir `! npx supabase db push --linked` ao usuário.
  Agrupar migrations para reduzir idas e vindas.
- **Durante o dual-run**, `last_status` de `alerts` aparece como `null` na view —
  o Python sobrescreve o health record com uma string JSON. Resolve no Passo 1.
- **Python só via `py -3`** (`python`/`python3` não resolvem). Deno e Supabase
  CLI só via `npx`.

## 🚫 Não fazer

- Não desligar cron do Actions antes dos passos 5 e 7 do checklist.
- Não agendar `etl-maritimo` enquanto a AISStream não voltar — polui o monitor.
- Não portar `etl_datasus.py` (exceção permanente: `pysus` + descompressão DBC).
- Não "corrigir" `titleCase` para o nome oficial dos municípios durante a
  migração — hoje ele reproduz o `str.title()` do Python de propósito
  (104 dos 399 ficam com conectivo capitalizado, ex. "Agudos Do Sul"). Item
  pós-migração, registrado no plano.

## 📌 Pendências do usuário

- **Revogar o access token `migracao-etl-c2-parana`** (supabase.com/dashboard/account/tokens) —
  apareceu em texto claro na conversa da sessão.
- **Org "APG Consulting" marcada como EXCEEDING USAGE LIMITS** no plano Free.
  Verificar antes de mover mais carga; a estimativa do plano (~25 mil
  invocações/mês contra 500 mil do free tier) é folgada, então provavelmente é
  outro recurso (banda ou tamanho do banco).
- `public-api` e `scrape-infohidro` **nunca foram deployadas**, ao contrário do
  que o plano e o STATUS assumiam.

## 📂 Dados fixos

- `project-ref`: `fialxjcsgywvvuxjxcly`
- Consulta de saúde: `select * from public.etl_stale;`
- Deploy: `npx supabase functions deploy etl-<nome> --project-ref fialxjcsgywvvuxjxcly --no-verify-jwt`
