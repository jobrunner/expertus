// Was passiert, wenn eine Pflichtadresse fehlt. Die README sagt es zu:
// Der Server läuft weiter, abgelehnt wird erst hier im Browser — mit einer
// Meldung, die das fehlende Feld benennt. Ohne diesen Test wäre die Zusage
// eine Behauptung, die beim nächsten Umbau still verfällt.
import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

test('eine unvollständige Konfiguration nennt das fehlende Feld', async ({ page }) => {
  await stubServices(page, {
    config: { habitatusBaseUrl: 'https://habitatus.test', hostusBaseUrl: 'https://hostus.test' },
  })
  await page.goto('/#/plots')
  // Genau dieser Wortlaut steht in der README.
  await expect(page.getByText('config.json unvollständig: ortusBaseUrl')).toBeVisible()
})

test('ohne situs startet die Anwendung und erfasst weiter', async ({ page }) => {
  await stubServices(page, {
    config: {
      ortusBaseUrl: 'https://ortus.test',
      habitatusBaseUrl: 'https://habitatus.test',
      hostusBaseUrl: 'https://hostus.test',
    },
  })
  await page.goto('/#/plots')
  // situs ist freiwillig: keine Meldung, die Maske steht.
  await expect(page.getByText(/unvollständig/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await expect(page.getByLabel('Sample-ID')).toBeVisible()
})
