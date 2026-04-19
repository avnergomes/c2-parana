# PROMPT 0 — DESABILITAR PAYWALL (ACESSO LIVRE)

## Prioridade: 🔴 BLOCKER — Executar PRIMEIRO

## Contexto
O C2 Paraná usa ProtectedRoute + AuthContext para verificar subscription. O trial de 14 dias expirou e TODAS as páginas redirecionam para `/pricing`. Precisamos desabilitar completamente a verificação de paywall para que qualquer usuário logado tenha acesso total, sem checar subscription/trial. O paywall será reativado depois, quando o sistema estiver funcional.

## Arquivos a Modificar

### 1. `src/router/ProtectedRoute.tsx`
**Estado atual** (31 linhas):
```tsx
export function ProtectedRoute({ children, requirePro = false }: ProtectedRouteProps) {
  const { loading, hasAccess, isPro, user } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!hasAccess) {
    return <Navigate to="/pricing" state={{ from: location, expired: true }} replace />
  }

  if (requirePro && !isPro) {
    return <Navigate to="/pricing" state={{ from: location, upgrade: true }} replace />
  }

  return <>{children}</>
}
```

**Alterar para** — remover as verificações de `hasAccess` e `isPro`, manter apenas login:
```tsx
export function ProtectedRoute({ children, requirePro = false }: ProtectedRouteProps) {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // TODO: Reativar paywall quando sistema estiver funcional
  // if (!hasAccess) {
  //   return <Navigate to="/pricing" state={{ from: location, expired: true }} replace />
  // }
  // if (requirePro && !isPro) {
  //   return <Navigate to="/pricing" state={{ from: location, upgrade: true }} replace />
  // }

  return <>{children}</>
}
```

### 2. `src/contexts/AuthContext.tsx`
**Na linha 103**, alterar `hasAccess` para sempre retornar `true` quando o usuário está logado:

**De:**
```tsx
const hasAccess = accessStatus === 'trialing' || accessStatus === 'active'
```

**Para:**
```tsx
// TEMPORÁRIO: Acesso livre para todos os usuários logados (paywall desativado)
const hasAccess = !!user  // true se logado, independente de subscription
```

**Na linha 106**, alterar `isPro` para sempre retornar `true` quando logado:
```tsx
// TEMPORÁRIO: Todos os usuários logados têm acesso Pro
const isPro = !!user
```

### 3. Verificar `src/components/ui/PaywallModal.tsx`
Se existir um PaywallModal usado em alguma página, garantir que ele não seja renderizado. Buscar no codebase por referências a `PaywallModal` ou `paywall`. Se alguma página usa diretamente, comentar a renderização.

### 4. Verificar `src/pages/PricingPage.tsx`
Manter a página `/pricing` funcional (será usada no futuro), mas remover qualquer mensagem de "trial expirado" que apareça. Se houver um banner de expiração, comentar.

## Validação
1. Fazer login com `teste@teste.com` / `teste123456`
2. Acessar `/dashboard` — deve carregar sem redirect
3. Navegar para `/clima`, `/saude`, `/ambiente`, `/agronegocio`, `/noticias`, `/legislativo`, `/mapa`
4. TODAS as páginas devem carregar (mesmo que sem dados — isso será corrigido nos próximos prompts)
5. Nenhuma deve redirecionar para `/pricing`

## Commit
```
git add -A && git commit -m "fix: desabilitar paywall temporariamente - acesso livre para desenvolvimento"
```
