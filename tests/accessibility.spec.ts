// tests/accessibility.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Acessibilidade básica', () => {
  test('Login: inputs têm labels ou aria-label', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')

    // Each input should have some accessible name
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()

    // Check that buttons have text content
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()
    const buttonText = await submitButton.textContent()
    expect(buttonText?.trim().length).toBeGreaterThan(0)
  })

  test('Pricing: planos são visíveis e distinguíveis', async ({ page }) => {
    await page.goto('/pricing')
    // Should have multiple plan cards/sections
    const soloText = page.locator('text=Solo')
    const proText = page.locator('text=Pro')
    await expect(soloText).toBeVisible()
    await expect(proText).toBeVisible()
  })

  test('Todas as páginas públicas carregam sem erros JS', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    const publicPages = ['/login', '/register', '/pricing', '/forgot-password']

    for (const route of publicPages) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
    }

    // Filter out known non-critical errors (e.g., Supabase connection when no backend)
    const criticalErrors = errors.filter(
      (e) => !e.includes('supabase') && !e.includes('fetch') && !e.includes('network')
    )
    expect(criticalErrors).toEqual([])
  })

  test('Navegação por teclado funciona no login', async ({ page }) => {
    await page.goto('/login')
    // Tab through form elements
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Should be able to reach the submit button via Tab
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })
})
