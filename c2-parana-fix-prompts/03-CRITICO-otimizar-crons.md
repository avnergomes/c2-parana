# PROMPT 03 — [CRÍTICO] Otimizar Crons GitHub Actions

## Contexto
O plano gratuito do GitHub Actions tem **2.000 minutos/mês** (~66 min/dia).

Consumo atual estimado dos crons:
| Cron | Frequência | Exec/dia | Tempo/exec | Min/dia |
|------|-----------|----------|------------|---------|
| `cron-noticias.yml` | */15 * * * * | 96 | ~30s | **48 min** |
| `cron-clima.yml` | 0 */1 * * * (30min) | 48 | ~30s | **24 min** |
| `cron-ambiente.yml` | 0 */6 * * * | 4 | ~45s | **3 min** |
| `cron-saude.yml` | ? | ? | ~60s | ~? |
| `cron-legislativo.yml` | ? | ? | ~20s | ~? |
| `keepalive.yml` | ? | ? | ~5s | ~? |
| **TOTAL** | | | | **>75 min/dia** |

Isso ultrapassa os ~66 min/dia do plano gratuito. O cron de notícias sozinho consome ~48 min/dia.

## Tarefa

### 1. Reduzir frequência do `cron-noticias.yml`

Arquivo: `.github/workflows/cron-noticias.yml`

**De**: `*/15 * * * *` (a cada 15 min = 96 exec/dia)  
**Para**: `0 */2 * * *` (a cada 2 horas = 12 exec/dia)

Justificativa: notícias RSS não são real-time. Atualizar a cada 2h é suficiente para um dashboard de inteligência territorial. Economia: de 48 min/dia para ~6 min/dia.

```yaml
on:
  schedule:
    - cron: '0 */2 * * *'   # A cada 2 horas (12 exec/dia)
  workflow_dispatch:
```

### 2. Reduzir frequência do `cron-clima.yml`

Arquivo: `.github/workflows/cron-clima.yml`

**De**: `*/30 * * * *` (a cada 30 min = 48 exec/dia)  
**Para**: `0 * * * *` (a cada 1 hora = 24 exec/dia)

Justificativa: dados INMET são atualizados a cada hora. Coletar a cada 30min gera leituras duplicadas.

```yaml
on:
  schedule:
    - cron: '0 * * * *'   # A cada hora (24 exec/dia)
  workflow_dispatch:
```

### 3. Verificar e ajustar outros crons

Verificar os arquivos:
- `.github/workflows/cron-saude.yml` — InfoDengue atualiza semanalmente. Cron ideal: `0 10 * * 1` (segunda às 10h UTC). Se está mais frequente, reduzir.
- `.github/workflows/cron-legislativo.yml` — ALEP atualiza em dias úteis. Cron ideal: `0 14,20 * * 1-5` (2x/dia em dias úteis).
- `.github/workflows/keepalive.yml` — Manter como está (geralmente 1x/dia).

### 4. Atualizar `refetchInterval` nos hooks do frontend

Para que o frontend espelhe as novas frequências dos crons:

**`src/hooks/useNoticias.ts`**: O `refetchInterval: 15 * 60 * 1000` (15min) deve mudar para `2 * 60 * 60 * 1000` (2h) — ou manter 30min (já que o frontend pode verificar se há dados novos no Supabase, mesmo que o ETL rode a cada 2h).

Na verdade, o `refetchInterval` do frontend pode ser mantido em 30min ou 1h — ele apenas re-busca do Supabase, não executa o ETL. Manter em `30 * 60 * 1000` (30min) é adequado.

### 5. Adicionar comentário com orçamento de Actions

Em cada arquivo de cron, adicionar um comentário no topo com a estimativa de consumo:

```yaml
# Budget: ~6 min/dia (12 exec × ~30s)
# Total estimado todos crons: ~20 min/dia de 66 min/dia disponíveis (plano free)
```

### 6. Novo orçamento após otimização

| Cron | Frequência Nova | Exec/dia | Min/dia |
|------|----------------|----------|---------|
| noticias | 0 */2 * * * | 12 | ~6 min |
| clima | 0 * * * * | 24 | ~12 min |
| ambiente | 0 */6 * * * | 4 | ~3 min |
| saude | 0 10 * * 1 | 0.14 | ~0.1 min |
| legislativo | 0 14,20 * * 1-5 | 1.4 | ~0.5 min |
| agro (novo) | 0 8 * * 1 | 0.14 | ~0.2 min |
| keepalive | 0 12 * * * | 1 | ~0.1 min |
| **TOTAL** | | | **~22 min/dia** |

Margem confortável: 22 min/dia de 66 min/dia disponíveis (33% de uso).

## Critério de Sucesso
- [ ] `cron-noticias.yml` usa `0 */2 * * *`
- [ ] `cron-clima.yml` usa `0 * * * *`
- [ ] `cron-saude.yml` usa frequência semanal ou 2x/semana
- [ ] `cron-legislativo.yml` usa frequência 2x/dia em dias úteis
- [ ] Consumo total estimado < 30 min/dia
- [ ] Comentários de budget adicionados nos workflows
