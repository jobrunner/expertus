// Tabellen auf Telefonbreite. Anlass war ein iPhone 14 Pro: sechs Spalten
// teilten sich 361 Pixel, Wörter brachen mitten durch ("Koor/dinat/e",
// "ausge/werte/t") und der Entfernen-Knopf wuchs aus der Karte heraus.
// Ursache war table-layout: fixed; seither stapeln sich die Zeilen
// unterhalb von 40rem zu Blöcken (.table-stack aus dem Design-System).
//
// Geprüft wird in der Viewport-Größe des Geräts, nicht in WebKit: die CI
// installiert nur Chromium, und der Fehler hing am Tabellenlayout, nicht an
// einer Eigenheit von Safari. Safari-spezifisches Verhalten deckt dieser
// Test also nicht ab.
import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

test.use({ viewport: { width: 393, height: 660 } })

const HOSTUS_LANG = {
  results: [{
    concept_id: 'cdm:a', display: 'Ammophila arenaria', canonical: 'Ammophila arenaria',
    target_space_name: 'Ammophila arenaria subsp. arundinacea',
    rank: 'SPECIES', status: 'ACCEPTED', in_area: false,
  }],
}

// Sucht sichtbare Elemente, die über ihren Elternteil hinausragen. Die
// Kopfzeile einer gestapelten Tabelle steht absichtlich außerhalb des
// Blickfelds und wird über checkVisibility ausgenommen.
async function ueberlaeufer(page) {
  return await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('*')) {
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue
      const r = el.getBoundingClientRect()
      const p = el.parentElement
      if (!p || r.width === 0) continue
      const pr = p.getBoundingClientRect()
      if (pr.width <= 2) continue
      const ueber = Math.round(r.right - pr.right)
      if (ueber > 1) out.push(`<${el.tagName.toLowerCase()}${el.className ? '.' + el.className.toString().split(' ')[0] : ''}> ragt ${ueber}px über <${p.tagName.toLowerCase()}>`)
    }
    return out
  })
}

async function rolltWaagerecht(page) {
  return await page.evaluate(() => {
    const d = document.scrollingElement
    return d.scrollWidth > d.clientWidth ? `${d.scrollWidth} > ${d.clientWidth}` : null
  })
}

test.beforeEach(async ({ page }) => {
  await stubServices(page, { hostus: { status: 200, contentType: 'application/json', body: JSON.stringify(HOSTUS_LANG) } })
})

test('die Plot-Liste bleibt auf Telefonbreite in ihrem Rahmen', async ({ page }) => {
  await page.addInitScript(() => {
    const plots = [{
      sampleId: 'Berlin-Tempelhofer-Feld-01', updatedAt: '2026-09-20T10:00:00.000Z',
      lat: 52.47, lon: 13.4, speciesCount: 7, result: 'N1A', status: 'ok', speciesNames: ['Festuca ovina'],
    }]
    localStorage.setItem('expertus.index', JSON.stringify(plots))
    for (const p of plots) localStorage.setItem('expertus.plot.' + p.sampleId, JSON.stringify({ ...p, species: [], scale: 'bb-classic' }))
  })
  await page.goto('/#/plots')
  await expect(page.getByRole('cell', { name: 'Berlin-Tempelhofer-Feld-01' })).toBeVisible()

  expect(await ueberlaeufer(page)).toEqual([])
  expect(await rolltWaagerecht(page)).toBeNull()
})

test('jede Zelle der gestapelten Liste nennt ihre Spalte', async ({ page }) => {
  await page.addInitScript(() => {
    const plots = [{ sampleId: 'P-1', updatedAt: '2026-09-20T10:00:00.000Z', lat: 52.5, lon: 13.4, speciesCount: 3, result: null, status: 'none', speciesNames: [] }]
    localStorage.setItem('expertus.index', JSON.stringify(plots))
    localStorage.setItem('expertus.plot.P-1', JSON.stringify({ ...plots[0], species: [], scale: 'bb-classic' }))
  })
  await page.goto('/#/plots')
  // Ohne data-label stünde in der gestapelten Ansicht eine Zahl ohne
  // Bezug — "12" allein sagt nicht, dass es Arten sind.
  const zellen = page.locator('table.table-stack tbody td')
  await expect(zellen.first()).toHaveAttribute('data-label', 'Sample-ID')
  await expect(zellen.nth(3)).toHaveAttribute('data-label', 'Arten')
})

test('die Artenliste bleibt auf Telefonbreite in ihrem Rahmen', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Art suchen').fill('Ammophila')
  await page.getByRole('listbox').getByRole('option').first().click()
  // Der lange Name steht vollständig in seiner Zelle, nicht mitten im Wort
  // gebrochen — und die Zelle trägt ihre Spaltenüberschrift.
  const artzelle = page.locator('td[data-label="Art"]')
  await expect(artzelle).toHaveText('Ammophila arenaria subsp. arundinacea')

  expect(await ueberlaeufer(page)).toEqual([])
  expect(await rolltWaagerecht(page)).toBeNull()
})
