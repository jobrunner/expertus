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

test('die Liste zeigt zu jedem Plot das Datum', async ({ page }) => {
  await seed(page, [{ sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] }])
  await page.goto('/#/plots')
  await expect(page.getByRole('row', { name: /Sylt-03/ })).toContainText('14.09.2026')
  await expect(page.getByRole('columnheader', { name: 'Datum' })).toBeVisible()
})

test('gespeicherte Plots stehen mit ihrem Ergebnis in der Liste', async ({ page }) => {
  await seed(page, [
    { sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] },
    { sampleId: 'Berlin-01', result: null, status: 'none', species: ['Festuca ovina'] },
  ])
  await page.goto('/#/plots')
  await expect(page.getByRole('row', { name: /Sylt-03/ })).toContainText('R1A')
  // Der Status hat keine eigene Spalte mehr: ohne Auswertung stand darin
  // wortgleich dasselbe wie unter "Ergebnis".
  await expect(page.getByRole('row', { name: /Berlin-01/ })).toContainText('nicht ausgewertet')
})

test('eine veraltete Auswertung ist in der Liste als solche erkennbar', async ({ page }) => {
  await seed(page, [{ sampleId: 'Sylt-03', result: 'R1A', status: 'stale', species: ['Ammophila arenaria'] }])
  await page.goto('/#/plots')
  const zeile = page.getByRole('row', { name: /Sylt-03/ })
  await expect(zeile).toContainText('R1A')
  // Ohne diesen Zusatz sähe ein veraltetes Ergebnis aus wie ein gültiges.
  await expect(zeile).toContainText('veraltet')
})

test('das Fragezeichen wird ausgeschrieben', async ({ page }) => {
  await seed(page, [{ sampleId: 'Fragezeichen-01', result: '?', status: 'ok', species: ['X'] }])
  await page.goto('/#/plots')
  await expect(page.getByRole('row', { name: /Fragezeichen-01/ })).toContainText('keine Regel trifft')
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

test('beim Routenwechsel meldet sich die verlassene Liste vom Store ab', async ({ page }) => {
  // Zählt Lesezugriffe auf den Index. Eine Ansicht, die sich nicht
  // abmeldet, zeichnet bei jedem künftigen store.set() erneut — auch
  // nachdem ihre Route längst verlassen wurde — und liest dafür jedes Mal
  // erneut den Index. Ohne Abmeldung wächst die Anzahl der Lesevorgänge
  // pro Klick mit jeder vorherigen Rückkehr zur Liste; mit sauberer
  // Abmeldung bleibt sie gleich, egal wie oft schon navigiert wurde.
  await page.addInitScript(() => {
    window.__indexReads = 0
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (key === 'expertus.index') window.__indexReads++
      return original.call(this, key)
    }
  })
  await page.goto('/#/plots')
  // Der Start der Anwendung ist asynchron (config.json, Router). Ohne
  // dieses Warten fielen seine eigenen Indexlesevorgänge in die Zählung
  // der ersten Runde und machten sie zufällig zu hoch.
  await expect(page.getByRole('button', { name: 'Neuen Plot anlegen' })).toBeVisible()

  async function neuerPlotUndZurueck() {
    await page.evaluate(() => { window.__indexReads = 0 })
    await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
    await expect(page).toHaveURL(/#\/plot\//)
    const reads = await page.evaluate(() => window.__indexReads)
    await page.goBack()
    await expect(page).toHaveURL(/#\/plots$/)
    return reads
  }

  const ersteRunde = await neuerPlotUndZurueck()
  await neuerPlotUndZurueck()
  await neuerPlotUndZurueck()
  const vierteRunde = await neuerPlotUndZurueck()

  // Dieselbe Aktion (ein Klick auf "Neuen Plot anlegen") muss unabhängig
  // von der Anzahl vorheriger Rundgänge gleich viele Indexlesevorgänge
  // auslösen: bleibt bei jeder Rückkehr zur Liste stets nur eine
  // Abonnentin aktiv, ändert sich die Zahl nicht. Ohne Abmeldung hätte
  // sich bis zur vierten Runde bereits eine dritte Abonnentin angesammelt,
  // und die Zahl wäre entsprechend gewachsen.
  expect(vierteRunde).toBe(ersteRunde)
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
      localStorage.setItem(`expertus.plot.${p.sampleId}`, JSON.stringify(plot))
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
    localStorage.setItem('expertus.index', JSON.stringify(index))
  }, plots)
}

// Der Fehler, der diesen Test nötig gemacht hat: das Suchfeld verlor nach
// dem ersten Zeichen den Fokus, weil jedes input-Ereignis die gesamte
// Ansicht neu zeichnete und das Feld dabei aus dem DOM nahm. Mit fill()
// war das nicht zu sehen — das setzt den Wert in einem Zug und löst nur ein
// einziges Ereignis aus. Nachgestellt wird deshalb zeichenweises Tippen.
test('im Suchfeld lässt sich zeichenweise tippen, ohne den Fokus zu verlieren', async ({ page }) => {
  await seed(page, [
    { sampleId: 'Sylt-03', result: 'R1A', status: 'ok', species: ['Ammophila arenaria'] },
    { sampleId: 'Berlin-01', result: null, status: 'none', species: ['Festuca ovina'] },
  ])
  await page.goto('/#/plots')
  const suche = page.getByLabel('Suche')
  await suche.click()
  await suche.pressSequentially('ammophila', { delay: 30 })

  await expect(suche).toHaveValue('ammophila')
  await expect(suche).toBeFocused()
  await expect(page.getByRole('row')).toHaveCount(2)
})
