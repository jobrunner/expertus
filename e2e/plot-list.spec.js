import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

test.beforeEach(async ({ page }) => {
  await stubServices(page)
})

test('ohne Plots erklärt die Liste, was zu tun ist', async ({ page }) => {
  await page.goto('/#/plots')
  await expect(page.getByRole('heading', { name: 'Plots' })).toBeVisible()
  await expect(page.getByText('Noch kein Plot erfasst.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Neuen Plot anlegen' })).toBeVisible()
})

test('ein neuer Plot führt direkt in die Maske', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await expect(page).toHaveURL(/#\/plot\/P-\d{4}-\d{2}-\d{2}-1$/)
})

test('gespeicherte Plots stehen mit Ergebnis und Status in der Tabelle', async ({ page }) => {
  await seed(page, [
    { sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] },
    { sampleId: 'Berlin-01', result: null, status: 'none', species: ['Festuca ovina'] },
  ])
  await page.goto('/#/plots')
  const zeile = page.getByRole('row', { name: /Sylt-03/ })
  await expect(zeile).toContainText('R1A')
  await expect(zeile).toContainText('ausgewertet')
  await expect(page.getByRole('row', { name: /Berlin-01/ })).toContainText('nicht ausgewertet')
})

test('das Fragezeichen wird ausgeschrieben', async ({ page }) => {
  await seed(page, [{ sampleId: 'A', result: '?', status: 'ok', species: ['X'] }])
  await page.goto('/#/plots')
  await expect(page.getByRole('row', { name: /A/ })).toContainText('keine Regel trifft')
})

test('die Suche greift über Sample-ID und Artname', async ({ page }) => {
  await seed(page, [
    { sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] },
    { sampleId: 'Berlin-01', result: null, status: 'none', species: ['Festuca ovina'] },
  ])
  await page.goto('/#/plots')
  await page.getByLabel('Suche').fill('ammophila')
  await expect(page.getByRole('row')).toHaveCount(2) // Kopfzeile + ein Treffer
  await expect(page.getByRole('row', { name: /Sylt-03/ })).toBeVisible()
})

test('der Statusfilter grenzt zusätzlich ein', async ({ page }) => {
  await seed(page, [
    { sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] },
    { sampleId: 'Berlin-01', result: null, status: 'none', species: ['Festuca ovina'] },
  ])
  await page.goto('/#/plots')
  await page.getByLabel('Status').selectOption('none')
  await expect(page.getByRole('row', { name: /Berlin-01/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Sylt-03/ })).toHaveCount(0)
})

test('eine leere Trefferliste sagt das, statt leer zu bleiben', async ({ page }) => {
  await seed(page, [{ sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] }])
  await page.goto('/#/plots')
  await page.getByLabel('Suche').fill('zzz')
  await expect(page.getByText('Kein Plot passt zur Suche.')).toBeVisible()
})

test('ein Klick auf die Sample-ID öffnet den Plot', async ({ page }) => {
  await seed(page, [{ sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] }])
  await page.goto('/#/plots')
  await page.getByRole('link', { name: 'Sylt-03' }).click()
  await expect(page).toHaveURL(/#\/plot\/Sylt-03$/)
})

test('die Liste ist per Tastatur erreichbar und zeigt den Fokus', async ({ page }) => {
  await seed(page, [{ sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] }])
  await page.goto('/#/plots')
  await page.keyboard.press('Tab') // Skip-Link
  await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused()
})

async function seed(page, plots) {
  await page.addInitScript((rows) => {
    const index = []
    for (const p of rows) {
      const plot = {
        sampleId: p.sampleId,
        createdAt: '2026-09-14T10:00:00.000Z',
        updatedAt: '2026-09-14T10:00:00.000Z',
        coordinate: { lat: 52.52, lon: 13.405 },
        species: p.species.map((name) => ({ name, cover: 10, coverClass: null, entry: 'manual' })),
        scale: 'bb-classic',
        evaluation: p.status === 'none' ? null : { at: 'x', request: {}, response: { result: p.result }, status: p.status },
      }
      localStorage.setItem(`legulus.plot.${p.sampleId}`, JSON.stringify(plot))
      index.push({
        sampleId: p.sampleId,
        updatedAt: plot.updatedAt,
        lat: 52.52,
        lon: 13.405,
        speciesCount: plot.species.length,
        speciesNames: p.species,
        result: p.result,
        status: p.status,
      })
    }
    localStorage.setItem('legulus.index', JSON.stringify(index))
  }, plots)
}
