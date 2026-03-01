// tests/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Autenticação', () => {
  test('Página de login carrega', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/C2 Paraná/)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('Redirect para /login quando não autenticado', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Registro mostra campos corretos', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('Página de preços carrega sem login', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('text=Solo')).toBeVisible()
    await expect(page.locator('text=Pro')).toBeVisible()
  })

  test('Link Esqueceu a senha presente', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('a[href*="forgot"]')).toBeVisible()
  })
})
