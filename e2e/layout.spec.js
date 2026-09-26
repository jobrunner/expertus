import { test, expect } from '@playwright/test'

test('die Abschnitte der Maske sind sichtbar getrennt', async ({ page }) => {
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()

  // Jeder Abschnitt trägt eine eigene Fläche; ohne sie verschwimmen
  // Standort, Kopfdaten, Arten und Auswertung zu einer einzigen Kolonne.
  //
  // Standort und Kopfdaten sind zuklappbar und tragen .akkordeon aus dem
  // Design-System — dasselbe Aussehen wie in Ortus. Die übrigen sind
  // <section class="card">. Beide setzen sich sichtbar ab.
  await expect(page.locator('main .card, main .akkordeon')).toHaveCount(4)

  for (const name of ['Standort', 'Kopfdaten', 'Arten', 'Auswertung']) {
    await expect(page.locator('main .card, main .akkordeon').filter({ hasText: name })).not.toHaveCount(0)
  }
})

test('die Übersicht trägt ihre Bedienleiste auf einer Fläche', async ({ page }) => {
  await page.goto('/index.html')
  await expect(page.locator('main .toolbar')).toHaveCount(1)
})
