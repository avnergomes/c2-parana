# Plano de Correção — C2 Paraná

**Data:** 2026-04-17
**Autor:** Auditoria autopilot
**Escopo:** Estado atual vs. planos (OVERVIEW → FASE5 → C4ISR) e ação corretiva

---

## 1. Estado atual — resumo executivo

O código está **mais avançado** que o plano original. O `c2-parana-prompts/00-OVERVIEW.md` descrevia um SaaS de 15 páginas; hoje o repo implementa um sistema C4ISR completo (Fases 3/4/5) com 26 páginas, 75 componentes, 33 hooks, 28 migrations Supabase, 22 ETLs Python e 23 workflows GitHub Actions.

**Inconsistência raiz:** não é código faltante — é **drift de escopo + paywall deliberadamente desligado + secrets commitados**.

| Dimensão | Planejado (OVERVIEW) | Implementado | Drift |
|---|---|---|---|
| Páginas | 15 | 26 | +11 (C4ISR) |
| Hooks | 7 | 33 | +26 |
| ETLs Python | 6 | 22 | +16 |
| Migrations | 3 | 28 | +25 |
| Workflows cron | 7 | 23 | +16 |
| Planos vivos | 1 | 6 | OVERVIEW + fix-v1 + fix-v2 + FASE3 + FASE4 + FASE5 + C4ISR |

---

## 2. Bloqueadores críticos

### 🔴 BLOQUEADOR #1 — Segurança: `.env` commitado com secrets de produção

**Localização:** `.env` (412 bytes, commitado em `18/03/2026 06:49:43`).

**Conteúdo exposto:**
- `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS completamente)
- `INFOHIDRO_USER` / `INFOHIDRO_PASS` (credenciais Sanepar)
- `GETEC_USER` / `GETEC_PASS`

**Impacto:** Qualquer pessoa com acesso ao repo (histórico git incluído) pode ler/escrever em todas as tabelas Supabase ignorando RLS, e usar credenciais de terceiros (Sanepar) sem autorização.

**Ação corretiva (ordem):**
1. Rotacionar **agora** todas as 3 credenciais (Supabase Dashboard → Project Settings → API → Reset service role; Sanepar/GETEC → trocar senha manualmente).
2. `git rm --cached .env` e adicionar `.env` ao `.gitignore` (confirmar se já está — aparentemente não).
3. Reescrever histórico git com `git filter-repo --path .env --invert-paths` (ou BFG). Force-push só após backup.
4. Mover secrets para GitHub Secrets (para Actions) e `.env.local` (para dev local).
5. Auditar `git log --all -- .env` e logs de acesso Supabase nas últimas semanas.

**Esforço:** 1-2h (rotação + history rewrite).
**Responsável sugerido:** você, imediatamente.

---

### 🔴 BLOQUEADOR #2 — Frontend: Paywall totalmente desligado

**Localização:** `src/contexts/AuthContext.tsx:102-121`.

**Sintoma:** todo usuário (inclusive anônimo) tem `hasAccess=true`, `isPro=true`, `accessStatus='active'` — hardcoded.

```typescript
// src/contexts/AuthContext.tsx:102
// TODO: Reativar quando auth e Stripe estiverem configurados
const hasAccess = true
const isPro = true
const computedAccessStatus: AuthContextType['accessStatus'] = 'active'
```

**Consequências:**
- Feature flags por plano (`PLAN_FEATURES` em `src/types/index.ts:44-81`) existem mas nunca são consultadas.
- `<ProtectedRoute>` implementado em `src/router/ProtectedRoute.tsx` mas **comentado** em `src/router/index.tsx:5-6`.
- `PaywallModal.tsx` e `PricingPage.tsx` existem mas não têm gate real.
- Trial de 14 dias do plano OVERVIEW nunca executa.

**Ação corretiva:**
1. Confirmar se Stripe keys (pk/sk) estão em GitHub Secrets e `.env.local`.
2. Reescrever `AuthContext.tsx:102-121` para derivar `hasAccess/isPro/accessStatus` da `subscription` real (query em `subscriptions` table).
3. Descomentar `ProtectedRoute` import em `router/index.tsx:5-6` e aplicar nas rotas privadas.
4. Adicionar teste Vitest cobrindo: usuário anônimo → bloqueado; trial ativo → acesso; plano vencido → paywall.
5. Validar Edge Functions `create-checkout` e `stripe-webhook` em staging (test mode) antes de live.

**Esforço:** 1 sessão focada (3-4h).

---

## 3. Problemas de prioridade alta

### 🟠 A. `src/lib/stripe.ts` ausente

**Plano OVERVIEW** exige `lib/stripe.ts` com `loadStripe` helper. Hook `useCheckout` faz import direto de `@stripe/stripe-js` em múltiplos lugares.

**Ação:** criar `src/lib/stripe.ts` exportando `stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)` uma única vez.

**Esforço:** 10 min.

---

### 🟠 B. Documentação e planos conflitantes

Existem **6 documentos de plano** ativos simultaneamente, alguns contraditórios:
- `c2-parana-prompts/` (SaaS original, 15 prompts)
- `c2-parana-fix-prompts/` (correções rodada 1)
- `c2-parana-fix-prompts-v2/` (correções rodada 2)
- `PLANO_IMPLEMENTACAO_C4ISR.md` (pivô para C4ISR)
- `PLANO_FASE3.md`, `PLANO_FASE4.md`, `PLANO_FASE5.md`

**Ação:**
1. Criar `docs/ARCHITECTURE.md` consolidando o estado atual real (o que está no código hoje).
2. Mover `c2-parana-prompts*` e `PLANO_*` antigos para `docs/archive/` preservando histórico.
3. Manter apenas um `ROADMAP.md` ativo apontando o próximo trabalho.
4. Atualizar `README.md` (hoje com 13 bytes — praticamente vazio).

**Esforço:** 1h.

---

### 🟠 C. Edge Functions — verificar deploy status

Existem 4 edge functions em `supabase/functions/`: `create-checkout`, `create-portal`, `scrape-infohidro`, `stripe-webhook`. Não consegui confirmar se foram feitas `supabase functions deploy`.

**Ação:** rodar `supabase functions list --project-ref fialxjcsgywvvuxjxcly` e fazer deploy do que estiver faltando. Configurar secrets com `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...`.

**Esforço:** 30 min (se secrets já existem).

---

## 4. Problemas de prioridade média

### 🟡 D. README vazio

`README.md` = 13 bytes (`# c2-parana`). Repo público sem docs de onboarding.

**Ação:** README com: o que é, stack, como rodar localmente (pnpm install, .env.local, pnpm dev), links para `docs/ARCHITECTURE.md` e `ROADMAP.md`.

**Esforço:** 30 min.

---

### 🟡 E. Pasta `reports/` vazia

Planos de Fase 4/5 prometem relatórios pós-incidente em `reports/`. Pasta está vazia — não fica claro se é por ainda não ter sido usada ou porque o pipeline não escreve lá.

**Ação:** inspecionar `etl_situational_report.py` e `etl_incident_escalation.py` para ver onde os relatórios caem. Se vão para Supabase Storage, remover pasta local (confusa); se deveriam gravar local, consertar.

**Esforço:** 1h.

---

### 🟡 F. Cobertura de testes no caminho Stripe/paywall é zero

Com paywall desligado, nenhum teste valida o fluxo real. Quando reativar (Bloqueador #2), adicionar testes E2E Playwright: cadastro → trial → checkout Stripe test → webhook → acesso concedido.

**Esforço:** 1 sessão após Bloqueador #2 resolvido.

---

### 🟡 G. Fase 5.A (CEMADEN) e 5.F (DataSUS) — aguardando validação em prod

Código shipado, migrations 026-028 no repo, crons agendados, mas primeiros runs em produção ainda não validados (DataSUS roda dia 5 mensal → próximo é 5 de maio). Precisa smoke test.

**Ação:** dispatch manual dos 2 workflows e verificar inserts em `cemaden_alerts` e `datasus_sih`.

**Esforço:** 20 min.

---

## 5. Problemas de prioridade baixa

### 🟢 H. Fases adiadas (5.B Sentinel, 5.C GEE, 5.G DENATRAN, 5.H SICAR)

Documentadas em FASE5 como adiadas por falta de orçamento (Sentinel Hub ~€50/mês) ou valor marginal. Não requer ação agora — manter na próxima janela de planejamento.

---

### 🟢 I. Múltiplos zips de prompts na raiz

`c2-parana-prompts.zip`, `c2-parana-research.zip`, `c2-parana-fix-prompts.zip`, `c2-parana-fix-prompts-v2.zip` — ~200 KB total. Conteúdo já está extraído nas pastas correspondentes.

**Ação:** mover para `docs/archive/zips/` ou remover após confirmar redundância.

**Esforço:** 5 min.

---

## 6. Ordem de execução sugerida

```
HOJE (P0 — 2-4h):
  1. Rotacionar SUPABASE_SERVICE_ROLE_KEY + INFOHIDRO + GETEC
  2. git rm --cached .env, .gitignore, filter-repo do histórico
  3. Mover secrets para GitHub Secrets e .env.local

ESSA SEMANA (P1 — 1 dia):
  4. Reativar paywall em AuthContext (derivar de subscription real)
  5. Descomentar ProtectedRoute no router
  6. Criar src/lib/stripe.ts
  7. Confirmar deploy das 4 edge functions + secrets Stripe

PRÓXIMA SEMANA (P2 — 0.5 dia):
  8. Consolidar docs: README, docs/ARCHITECTURE, docs/ROADMAP, docs/archive
  9. Adicionar testes E2E de paywall
  10. Smoke test CEMADEN + DataSUS em prod (dispatch manual)

DEPOIS (P3):
  11. Avaliar orçamento Sentinel Hub → Fase 5.B
  12. Abrir Fase 5.G/5.H se houver demanda
```

---

## 7. Anti-drift — como evitar que volte a acontecer

1. **Um plano ativo por vez.** Quando uma fase fecha, arquivar em `docs/archive/` e atualizar `ROADMAP.md`. Ter 6 planos vivos é como não ter plano.
2. **Nenhum `TODO: reativar` no main sem issue rastreando.** O paywall ficou desligado há ~1 mês sem tracking — se não couber em branch, abrir issue com label `p0-blocker`.
3. **Pre-commit hook bloqueando `.env`.** Adicionar `.env` ao `.gitignore` e um hook `git secrets` ou `detect-secrets` que falha o commit se detectar padrões de chave.
4. **Separar `supabase/functions/` do resto do codebase.** Considerar mover para `apps/edge/` se o projeto crescer.
5. **Revisar README a cada fecho de fase** — hoje tem 13 bytes, é o primeiro sinal de que a documentação não acompanha o código.

---

*Fim do plano de correção.*
