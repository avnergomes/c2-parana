# C2 Paraná — Prompts de Correção (Auditoria 01/03/2026)

> Execute os prompts na ordem numérica. Cada prompt é autocontido e pode ser executado independentemente, mas a ordem minimiza conflitos de merge.

## Prioridade CRÍTICA (blockers para produção)

| # | Arquivo | Escopo | Bugs corrigidos |
|---|---------|--------|-----------------|
| 01 | `01-CRITICO-etl-agro.md` | Criar `etl_agro.py` + cron + migration | Bug #1 (ETL Agro ausente) |
| 02 | `02-CRITICO-etl-ana-telemetria.md` | Substituir endpoint ANA por SNIRHweb | Bug #2 (ANA endpoint inativo) |
| 03 | `03-CRITICO-otimizar-crons.md` | Reduzir frequência dos crons | Bug #3 (esgota GitHub Actions) |

## Prioridade ALTA

| # | Arquivo | Escopo | Bugs corrigidos |
|---|---------|--------|-----------------|
| 04 | `04-ALTO-paywall-firespots-dashboard.md` | Paywall Legislativo + UNIQUE fire_spots + Dashboard real | Bugs #4, #5, #6 |

## Prioridade MÉDIA

| # | Arquivo | Escopo | Bugs corrigidos |
|---|---------|--------|-----------------|
| 05 | `05-MEDIO-correcoes-diversas.md` | air_quality upsert, isPro, refreshSubscription, dengueSerie, GeoJSON | Bugs #7, #8, #9, #10, #11 |

## Prioridade BAIXA

| # | Arquivo | Escopo | Bugs corrigidos |
|---|---------|--------|-----------------|
| 06 | `06-BAIXO-polish.md` | vite base, lucide, etl_saude ano, KPIs hardcoded, Stripe docs | Bugs #12, #13, #14, #15, #16 |

## Melhorias Técnicas (pós-launch)

| # | Arquivo | Escopo |
|---|---------|--------|
| 07 | `07-RECOMENDACOES-tecnicas.md` | RLS data_cache, Realtime, testes, Sentry, Zod, tokens BFF |

---

## Estimativa de Esforço Total
- Prompts 01-04: ~4-6 horas de Claude Code
- Prompts 05-06: ~2-3 horas de Claude Code
- Prompt 07: ~3-4 horas de Claude Code (pode ser feito depois do launch)
