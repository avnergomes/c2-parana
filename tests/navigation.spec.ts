// tests/navigation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Navegação (páginas públicas)', () => {
  test('Página de login tem formulário', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('Página de registro tem link para login', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('a[href*="login"]')).toBeVisible()
  })

  test('Página de preços mostra planos', async ({ page }) => {
    await page.goto('/pricing')
    // Verifica se há cards de planos
    await expect(page.locator('text=R$')).toBeVisible()
  })

  test('Forgot password carrega', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })
})

test.describe('Navegação protegida (redireciona)', () => {
  test('Dashboard redireciona para login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('Mapa redireciona para login', async ({ page }) => {
    await page.goto('/mapa')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('Clima redireciona para login', async ({ page }) => {
    await page.goto('/clima')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })
})
