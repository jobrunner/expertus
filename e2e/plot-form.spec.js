import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

test.beforeEach(async ({ page }) => {
  await stubServices(page)
})

async function neuerPlot(page) {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
}

test('die Maske zeigt die vier Abschnitte', async ({ page }) => {
  await neuerPlot(page)
  for (const t of ['Standort', 'Kopfdaten', 'Arten', 'Auswertung']) {
    await expect(page.getByRole('heading', { name: t })).toBeVisible()
  }
})

test('eine eingegebene Koordinate holt die Kopfdaten', async ({ page }) => {
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('52.52')
  await page.getByLabel('Länge').fill('13.405')
  await page.getByLabel('Länge').blur()
  // Ein Auswahlfeld hat keinen eigenen sichtbaren Textknoten für die
  // gewählte Option — geprüft wird deshalb der Feldwert selbst, nicht
  // getByText.
  await expect(page.getByLabel('Country')).toHaveValue('Germany')
  await expect(page.getByLabel('Ecoreg')).toHaveValue('654')
  await expect(page.getByLabel('Coast_EEA')).toHaveValue('N_COAST')
})

test('die Herkunft jedes Kopfdatums ist sichtbar', async ({ page }) => {
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('52.52')
  await page.getByLabel('Länge').fill('13.405')
  await page.getByLabel('Länge').blur()
  await expect(page.getByRole('row', { name: /Country/ })).toContainText('aus ortus')
})

test('ein nicht ableitbares Feld ist hervorgehoben und von Hand setzbar', async ({ page }) => {
  // Ecoregion fehlt: die Quelle taucht in der Antwort gar nicht auf.
  await stubServices(page, {
    ortus: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coordinate: { x: 12.45, y: 54.45 },
        gazetteer: { admin: { country_iso: 'DE' }, elevation: { meters: 0 } },
        results: [
          { source_id: 'coast-eea-2022', features: [{ layer: 'coast_eea', properties: { coast_eea: 'BAL_COAST', sea_region: 'Baltic Sea' } }] },
          { source_id: 'bohn-dunes-2019', features: [{ layer: 'dunes_bohn', properties: { dunes_bohn: 'N_DUNES' } }] },
        ],
      }),
    },
  })
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('54.45')
  await page.getByLabel('Länge').fill('12.45')
  await page.getByLabel('Länge').blur()
  const zeile = page.getByRole('row', { name: /Ecoreg/ })
  await expect(zeile).toContainText('nicht ableitbar')
  // Das Kopfdatum übernimmt erst beim Verlassen des Felds, nicht bei
  // jedem Zeichen — wie ein Mensch es tut: tippen, dann wegklicken.
  await page.getByLabel('Ecoreg').fill('664')
  await page.getByLabel('Ecoreg').blur()
  await expect(zeile).toContainText('von Hand gesetzt')
})

test('Belege stehen als Nebentext, nicht als Kopfdatum', async ({ page }) => {
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('52.52')
  await page.getByLabel('Länge').fill('13.405')
  await page.getByLabel('Länge').blur()
  await expect(page.getByRole('row', { name: /Ecoreg/ })).toContainText('Central European mixed forests')
})

test('Höhe null Meter gilt als Wert, nicht als Lücke', async ({ page }) => {
  await stubServices(page, {
    ortus: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coordinate: { x: 13.405, y: 52.52 },
        gazetteer: { admin: { country_iso: 'DE' }, elevation: { meters: 0 } },
        results: [
          { source_id: 'ecoregions-2017', features: [{ layer: 'ecoregions', properties: { ECO_ID: 654 } }] },
          { source_id: 'coast-eea-2022', features: [{ layer: 'coast_eea', properties: { coast_eea: 'N_COAST' } }] },
          { source_id: 'bohn-dunes-2019', features: [{ layer: 'dunes_bohn', properties: { dunes_bohn: 'N_DUNES' } }] },
        ],
      }),
    },
  })
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('52.52')
  await page.getByLabel('Länge').fill('13.405')
  await page.getByLabel('Länge').blur()
  await expect(page.getByRole('row', { name: /Altitude/ })).not.toContainText('nicht ableitbar')
})

test('der GPS-Knopf füllt beide Felder auf sechs Nachkommastellen und nennt die Genauigkeit', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 54.9012345, longitude: 8.3123456, accuracy: 12 })
  await neuerPlot(page)
  await page.getByRole('button', { name: 'Aktuellen Standort verwenden' }).click()
  await expect(page.getByLabel('Breite')).toHaveValue('54.901235')
  await expect(page.getByLabel('Länge')).toHaveValue('8.312346')
  await expect(page.getByText('± 12 m')).toBeVisible()
})

test('ein eingefügtes Koordinatenpaar verteilt sich auf beide Felder', async ({ page }) => {
  await neuerPlot(page)
  await page.getByLabel('Breite').focus()
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '52.52, 13.405')
    document.querySelector('#breite').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.getByLabel('Breite')).toHaveValue('52.52')
  await expect(page.getByLabel('Länge')).toHaveValue('13.405')
})

// Der Nachweis, dass die Artenliste während des Kopfdaten-Abrufs bedienbar
// bleibt, hängt am Suchfeld für Arten — das baut erst Task 16. Bis dahin
// ausgesetzt; Task 16 schaltet ihn wieder scharf.
test.fixme('die Artenliste bleibt bedienbar, während die Kopfdaten laden', async ({ page }) => {
  let freigeben
  await page.route('https://ortus.test/api/v1/query*', async (route) => {
    await new Promise((res) => (freigeben = res))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"coordinate":{"x":13.405,"y":52.52},"gazetteer":{},"results":[]}' })
  })
  await neuerPlot(page)
  await page.getByLabel('Breite').fill('52.52')
  await page.getByLabel('Länge').fill('13.405')
  await page.getByLabel('Länge').blur()
  await expect(page.getByText('Kopfdaten werden geholt …')).toBeVisible()
  await expect(page.getByLabel('Art suchen')).toBeEnabled()
  freigeben()
})

test('die Sample-ID ist umbenennbar, eine Kollision wird gemeldet', async ({ page }) => {
  await neuerPlot(page)
  await page.getByLabel('Sample-ID').fill('Sylt-03')
  await page.getByLabel('Sample-ID').blur()
  await expect(page).toHaveURL(/#\/plot\/Sylt-03$/)
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Sample-ID').fill('Sylt-03')
  await page.getByLabel('Sample-ID').blur()
  await expect(page.getByText('Die Sample-ID Sylt-03 ist bereits vergeben.')).toBeVisible()
})

test('der Auswerten-Knopf nennt den Grund seiner Sperre', async ({ page }) => {
  await neuerPlot(page)
  await expect(page.getByRole('button', { name: 'Auswerten' })).toBeDisabled()
  await expect(page.getByText(/Kopfdaten fehlen/)).toBeVisible()
})
