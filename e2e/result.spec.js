import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

async function fertigerPlot(page) {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  await expect(page.getByRole('row', { name: /Country/ })).toContainText('aus ortus')
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca ovina')
  await input.press('Enter')
  await page.getByLabel('Deckung von Festuca ovina').selectOption('3')
}

test.beforeEach(async ({ page }) => {
  await stubServices(page)
})

test('der Auswerten-Knopf wird frei, sobald nichts mehr fehlt', async ({ page }) => {
  await fertigerPlot(page)
  await expect(page.getByRole('button', { name: 'Auswerten' })).toBeEnabled()
})

test('das Ergebnis erscheint unter der Maske, ohne Navigation', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  // Nicht page.getByText('R1A'): der Code steht wörtlich auch in der
  // (zugeklappten) Trefferliste des Anhangs und in der stillen Live-Region
  // — bare getByText wäre über alle drei mehrdeutig. Das <strong> der
  // Ergebniszeile ist im Dokument einmalig und trifft gezielt das
  // sichtbare Ergebnis.
  await expect(page.locator('strong', { hasText: 'R1A' })).toBeVisible()
  await expect(page).toHaveURL(/#\/plot\//)
})

test('das Ergebnis wird angesagt, nicht nur angezeigt', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await expect(page.locator('#meldungen')).toContainText('R1A')
})

test('der Anhang ist zugeklappt und enthält alle Treffer mit Priorität und Variante', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  const anhang = page.getByRole('group', { name: 'Wie kam das Ergebnis zustande?' })
  await expect(anhang).not.toHaveAttribute('open', '')
  await anhang.getByText('Wie kam das Ergebnis zustande?').click()
  await expect(anhang).toContainText('R1B')
  await expect(anhang).toContainText('N16!')
  await expect(anhang).toContainText('Priorität 2')
})

test('die Gewinnerbegründung nennt die angewandte Regel', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await page.getByText('Wie kam das Ergebnis zustande?').click()
  await expect(page.getByText(/höchste Prioritätsstufe mit genau einem Treffer/)).toBeVisible()
})

test('der Auflösungsbericht zeigt jeden Namen und warnt vor unaufgelösten', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await page.getByText('Wie kam das Ergebnis zustande?').click()
  await expect(page.getByText('Festuca ovina aggr.')).toBeVisible()
  await expect(page.getByRole('row', { name: /Tippfehlerus/ })).toContainText('unaufgelöst')
  await expect(page.getByText(/zählt weiterhin in die Gesamtdeckung/)).toBeVisible()
})

test('der abgesetzte Request steht im Anhang', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await page.getByText('Wie kam das Ergebnis zustande?').click()
  await expect(page.getByText(/"backbone": "euro\+med"/)).toBeVisible()
  await expect(page.getByText('EUNIS-ESy-2025-10-03')).toBeVisible()
})

test('ein Fragezeichen wird ausgeschrieben', async ({ page }) => {
  await stubServices(page, {
    habitatus: { status: 200, contentType: 'application/json', body: JSON.stringify({ result: '?', matches: [], resolution: [], versions: {}, truncated_at_10: false }) },
  })
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  // Wie oben: "keine Regel trifft" steht wortgleich auch in der
  // Gewinnerbegründung im Anhang und in der Live-Region — gezielt das
  // sichtbare Ergebnis prüfen, nicht irgendein Vorkommen des Wortlauts.
  await expect(page.locator('strong', { hasText: 'keine Regel trifft' })).toBeVisible()
})

test('eine Änderung nach der Auswertung markiert das Ergebnis als veraltet', async ({ page }) => {
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  const ergebnis = page.locator('strong', { hasText: 'R1A' })
  await expect(ergebnis).toBeVisible()
  const input = page.getByLabel('Art suchen')
  await input.fill('Nardus stricta')
  await input.press('Enter')
  await expect(page.getByText('veraltet')).toBeVisible()
  // Das alte Ergebnis bleibt sichtbar — man soll sehen, was sich ändert.
  await expect(ergebnis).toBeVisible()
})

test('die 400-Meldung von habitatus steht wörtlich da', async ({ page }) => {
  await stubServices(page, {
    habitatus: { status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unknown country "Deutschland"' }) },
  })
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await expect(page.getByRole('alert')).toContainText('unknown country "Deutschland"')
})

test('die 400-Meldung bleibt am Plot und steht auch nach dem Wiederöffnen da', async ({ page }) => {
  await stubServices(page, {
    habitatus: { status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unknown country "Deutschland"' }) },
  })
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await expect(page.getByRole('alert')).toContainText('unknown country "Deutschland"')
  await page.reload()
  // Nach dem Neuladen gibt es keine Alarmmeldung mehr — die am Plot
  // gespeicherte Meldung benennt aber das beanstandete Feld und muss
  // dastehen, sonst weiß niemand, was zu korrigieren ist.
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()
  await expect(page.getByText('unknown country "Deutschland"')).toBeVisible()
})

test('ein Dienstfehler bietet einen zweiten Versuch an', async ({ page }) => {
  await stubServices(page, { habitatus: { status: 503, body: 'weg' } })
  await fertigerPlot(page)
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()
})

test('der gesperrte Auswerten-Knopf nennt seinen Grund zugänglich', async ({ page }) => {
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()

  const knopf = page.getByRole('button', { name: 'Auswerten' })
  await expect(knopf).toBeDisabled()

  // Ein gesperrter Knopf mit einer losen Textzeile darunter verbindet
  // beide nicht: wer nicht sieht, hört den Grund nie. aria-describedby
  // stellt die Verbindung her.
  const id = await knopf.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  await expect(page.locator(`#${id}`)).toContainText('Kopfdaten fehlen')
})
