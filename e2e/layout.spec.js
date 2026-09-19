import { test, expect } from '@playwright/test'

test('die Abschnitte der Maske sind sichtbar getrennt', async ({ page }) => {
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()

  // Jeder Abschnitt trägt eine eigene Fläche; ohne sie verschwimmen
  // Standort, Kopfdaten, Arten und Auswertung zu einer einzigen Kolonne.
  const karten = page.locator('main section.card')
  await expect(karten).toHaveCount(4)

  for (const name of ['Standort', 'Kopfdaten', 'Arten', 'Auswertung']) {
    await expect(page.locator('section.card').filter({ hasText: name })).not.toHaveCount(0)
  }
})

test('die Übersicht trägt ihre Bedienleiste auf einer Fläche', async ({ page }) => {
  await page.goto('/index.html')
  await expect(page.locator('main .toolbar')).toHaveCount(1)
})
