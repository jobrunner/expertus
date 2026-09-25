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
  await expect(zellen.nth(2)).toHaveAttribute('data-label', 'Ergebnis')
})

test('die Artenliste bleibt auf Telefonbreite in ihrem Rahmen', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Art suchen').fill('Ammophila')
  await page.getByRole('listbox').getByRole('option').first().click()
  // Der lange Name steht vollständig in seiner Zelle, nicht mitten im Wort
  // gebrochen — und die Zelle trägt ihre Spaltenüberschrift.
  // Der Name steht vollständig da; das hochgestellte Zeichen dahinter
  // nennt die Herkunft (aus Vorschlag / von Hand).
  const artzelle = page.locator('td[data-label="Art"]')
  await expect(artzelle).toContainText('Ammophila arenaria subsp. arundinacea')

  expect(await ueberlaeufer(page)).toEqual([])
  expect(await rolltWaagerecht(page)).toBeNull()
})

// Auf Telefonbreite sind beide Listen dicht gesetzt: eine Art ist eine
// Zeile, ein Plot zwei. Vorher brauchte eine Art vier Zeilen und 175 px,
// ein Plot sechs — bei einem halben Tag im Gelände scrollt man dadurch
// durch Formulare, statt eine Liste zu überblicken.
test('eine Art ist auf Telefonbreite eine Zeile', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  for (const name of ['Festuca ovina', 'Carex arenaria', 'Salsola kali']) {
    const feld = page.getByLabel('Art suchen')
    await feld.fill(name)
    await feld.press('Enter')
  }
  const zeilen = page.locator('.arten-liste tbody tr')
  await expect(zeilen).toHaveCount(3)

  const hoehen = await zeilen.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  // 2,75 rem ist die Mindestzielfläche für Auswahl und Knopf (WCAG 2.5.8);
  // darunter geht es nicht, viel darüber soll es nicht gehen.
  for (const h of hoehen) expect(h).toBeLessThan(80)
})

test('die Deckung bleibt in der dichten Zeile bedienbar', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  const feld = page.getByLabel('Art suchen')
  await feld.fill('Festuca ovina')
  await feld.press('Enter')

  await page.getByLabel('Deckung von Festuca ovina').selectOption('3')
  await expect(page.getByLabel('Deckung von Festuca ovina')).toHaveValue('3')
  // Der Entfernen-Knopf trägt nur noch ein Symbol — sein zugänglicher Name
  // muss weiterhin die Art nennen, sonst sind zwölf Knöpfe nicht zu
  // unterscheiden.
  await expect(page.getByRole('button', { name: 'Festuca ovina entfernen' })).toBeVisible()
})

test('ein Plot ist auf Telefonbreite zwei Zeilen', async ({ page }) => {
  await page.addInitScript(() => {
    const plots = Array.from({ length: 5 }, (_, i) => ({
      sampleId: `Sylt-Dünental-0${i + 1}`, updatedAt: `2026-09-1${i}T10:00:00.000Z`,
      lat: 54.9, lon: 8.31, speciesCount: 9, result: i % 2 ? 'N1A' : null,
      status: i % 2 ? 'ok' : 'none', speciesNames: [],
    }))
    localStorage.setItem('expertus.index', JSON.stringify(plots))
    for (const p of plots) localStorage.setItem('expertus.plot.' + p.sampleId, JSON.stringify({ ...p, species: [], scale: 'bb-classic' }))
  })
  await page.goto('/#/plots')
  const zeilen = page.locator('.plot-liste tbody tr')
  await expect(zeilen).toHaveCount(5)

  const hoehen = await zeilen.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  for (const h of hoehen) expect(h).toBeLessThan(90)

  // Koordinate und Artenzahl stehen nicht mehr in der Übersicht: sie sind
  // erst im Plot selbst von Belang und kosteten je Eintrag zwei Zeilen.
  await expect(page.locator('.plot-liste')).not.toContainText('54.9')
  await expect(page.locator('.plot-liste thead')).not.toContainText('Arten')
})

test('die Felder des Standortformulars stehen in gleichem Abstand', async ({ page }) => {
  // Breiten- und Längengrad liegen im .koord-gitter, die übrigen Felder
  // daneben in einfachen .form-group. Solange das Gitter seinen gap UND
  // die Feldgruppen darin ihren margin-bottom hatten, addierten sich beide,
  // sobald das Gitter auf eine Spalte umbricht: zwischen Lat und Lon stand
  // dann 1 rem mehr Luft als zwischen allen anderen Feldern — ausgerechnet
  // zwischen den beiden, die zusammengehören.
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await expect(page.getByLabel('Längengrad (Lon)')).toBeVisible()

  const luecken = await page.evaluate(() => {
    const ids = ['sample', 'standort-system', 'standort-y', 'standort-x']
    const felder = ids.map((id) => document.getElementById(id))
    const out = []
    for (let i = 0; i < felder.length - 1; i += 1) {
      out.push(Math.round(felder[i + 1].getBoundingClientRect().top - felder[i].getBoundingClientRect().bottom))
    }
    return out
  })

  // Alle Abstände innerhalb von 4 px: Unterschiede darüber sind als
  // ungleicher Rhythmus sichtbar.
  const kleinste = Math.min(...luecken)
  const groesste = Math.max(...luecken)
  expect(groesste - kleinste).toBeLessThanOrEqual(4)
})
