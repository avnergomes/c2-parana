// tests/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard (não autenticado)', () => {
  test('Redireciona para login quando acessa /dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('Redireciona para login quando acessa /saude', async ({ page }) => {
    await page.goto('/saude')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('Redireciona para login quando acessa /agro', async ({ page }) => {
    await page.goto('/agro')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })
})

test.describe('Páginas públicas - conteúdo', () => {
  test('Login tem campos de email e senha', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(submitButton).toBeVisible()
  })

  test('Pricing exibe planos Solo e Pro', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('text=Solo')).toBeVisible()
    await expect(page.locator('text=Pro')).toBeVisible()
    // Verifica que preço é mostrado
    await expect(page.locator('text=R$')).toBeVisible()
  })

  test('Forgot password aceita email', async ({ page }) => {
    await page.goto('/forgot-password')
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()
    await emailInput.fill('test@example.com')
    await expect(emailInput).toHaveValue('test@example.com')
  })
})
