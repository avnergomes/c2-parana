// tests/map.spec.ts
import { test, expect } from '@playwright/test'

// Estes testes requerem autenticação
// Por enquanto, apenas verificamos que a página redireciona corretamente

test.describe('Mapa Central', () => {
  test('Redireciona para login se não autenticado', async ({ page }) => {
    await page.goto('/mapa')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('Página de pricing é acessível', async ({ page }) => {
    await page.goto('/pricing')
    // A página de pricing deve carregar sem redirect
    await expect(page.locator('body')).toBeVisible()
    expect(page.url()).toContain('/pricing')
  })
})

// Testes com autenticação podem ser adicionados usando storageState
// test.describe('Mapa (autenticado)', () => {
//   test.use({ storageState: 'auth.json' })
//
//   test('Mapa Leaflet carrega', async ({ page }) => {
//     await page.goto('/mapa')
//     await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })
//   })
// })
