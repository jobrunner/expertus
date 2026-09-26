import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

test.beforeEach(async ({ page }) => {
  await stubServices(page)
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
})

test('das Suchfeld ist eine Combobox nach ARIA', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await expect(input).toHaveAttribute('role', 'combobox')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(input).toHaveAttribute('aria-autocomplete', 'list')
})

test('Tippen öffnet die Vorschlagsliste', async ({ page }) => {
  await page.getByLabel('Art suchen').fill('Festuca')
  await expect(page.getByRole('listbox')).toBeVisible()
  // Auf die Vorschlagsliste eingegrenzt: die Deckungsskala ist ebenfalls
  // ein <select> und dessen <option>-Elemente tragen dieselbe ARIA-Rolle
  // "option" — ein ungerichtetes page.getByRole('option') träfe also auch
  // sie und nicht nur die Vorschläge.
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2)
  await expect(page.getByLabel('Art suchen')).toHaveAttribute('aria-expanded', 'true')
})

test('Treffer im Gebiet stehen oben, abweichende Namen stehen dabei', async ({ page }) => {
  await page.getByLabel('Art suchen').fill('Festuca')
  // Siehe Kommentar oben: nur die Vorschlagsliste, nicht die
  // Deckungsskala, die ebenfalls role="option"-Elemente enthält.
  const optionen = page.getByRole('listbox').getByRole('option')
  await expect(optionen.first()).toContainText('Festuca ovina')
  // Übernommen wird der Euro+Med-Name, der an habitatus geht; darunter
  // steht, unter welchem Namen hostus das Konzept führt.
  await expect(optionen.nth(1)).toContainText('Festuca rubra subsp. arenaria')
  await expect(optionen.nth(1)).toContainText('für Festuca rubra')
})

test('kein Vorschlag trägt mehr den Hinweis "nicht Euro+Med"', async ({ page }) => {
  // hostus liefert jetzt ausschließlich Namen aus Euro+Med; der frühere
  // Hinweis erschien an jedem Treffer und war damit wertlos.
  await page.getByLabel('Art suchen').fill('Festuca')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('listbox')).not.toContainText('nicht Euro+Med')
})

test('Pfeiltasten wandern und setzen aria-activedescendant', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca')
  // Wie ein Mensch es tut: die Pfeiltaste kommt, wenn Vorschläge dastehen,
  // nicht während der Entprellung noch läuft.
  await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible()
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'expertus-option-0')
  // Siehe Kommentar oben: nur die Vorschlagsliste, nicht die
  // Deckungsskala, die ebenfalls role="option"-Elemente enthält.
  await expect(page.getByRole('listbox').getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'expertus-option-1')
})

test('Enter übernimmt die markierte Art in die Liste', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca')
  // Wie ein Mensch es tut: die Pfeiltaste kommt, wenn Vorschläge dastehen,
  // nicht während der Entprellung noch läuft.
  await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible()
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(page.getByRole('row', { name: /Festuca ovina/ })).toBeVisible()
  await expect(input).toHaveValue('')
})

test('Enter ohne Markierung übernimmt den Freitext', async ({ page }) => {
  // Ohne Freitext sind ESy-Konventionen wie "Quercus species" nicht eingebbar.
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await expect(page.getByRole('row', { name: /Quercus species/ })).toBeVisible()
})

test('Escape schließt die Liste, ohne etwas zu übernehmen', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca')
  await input.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
})

test('ein zweiter gleicher Name wird gewarnt, aber nicht zusammengeführt', async ({ page }) => {
  // Habitatus vereinigt Deckungen nach Jennings-Fischer; eine stille
  // Zusammenführung im Frontend würde genau diesen Schritt verfälschen.
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await input.fill('Quercus species')
  await input.press('Enter')
  await expect(page.getByRole('row', { name: /Quercus species/ })).toHaveCount(2)
  await expect(page.getByText('Quercus species steht mehrfach in der Liste.')).toBeVisible()
})

test('die Deckung wird als Klasse gewählt und als Prozent gezeigt', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await page.getByLabel('Deckung von Quercus species').selectOption('3')
  await expect(page.getByRole('row', { name: /Quercus species/ })).toContainText('37,5 %')
})

test('der Skalenwechsel lässt Prozent stehen und nimmt nur das Etikett weg', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await page.getByLabel('Deckung von Quercus species').selectOption('2')
  await page.getByLabel('Deckungsskala').selectOption('bb-extended')
  await expect(page.getByRole('row', { name: /Quercus species/ })).toContainText('15 %')
  await expect(page.getByRole('row', { name: /Quercus species/ })).not.toContainText('(15 %)')
})

test('in der Prozentskala ist die Deckung direkt eingebbar', async ({ page }) => {
  await page.getByLabel('Deckungsskala').selectOption('percent')
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  // Nicht getByLabel: die Plus-/Minus-Knöpfe tragen den Artnamen als
  // Präfix ihres Namens und würden mittreffen.
  const feld = page.getByRole('textbox', { name: 'Deckung von Quercus species' })
  await feld.fill('24,65')
  await feld.blur()
  await expect(feld).toHaveValue('24,65')
  // Die Einheit steht daneben, nicht im Feld.
  await expect(page.getByRole('row', { name: /Quercus species/ })).toContainText('%')
})

test('die Knöpfe springen auf übliche Schätzstufen', async ({ page }) => {
  await page.getByLabel('Deckungsskala').selectOption('percent')
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  const feld = page.getByRole('textbox', { name: 'Deckung von Quercus species' })
  await feld.fill('10')
  await feld.blur()

  // Unten fein, oben grob: niemand unterscheidet 87 von 88 Prozent.
  await page.getByRole('button', { name: /erhöhen/ }).click()
  await expect(feld).toHaveValue('15')
  await page.getByRole('button', { name: /erhöhen/ }).click()
  await expect(feld).toHaveValue('20')
  await page.getByRole('button', { name: /verringern/ }).click()
  await expect(feld).toHaveValue('15')
})

test('ein eigener Wert bleibt eingebbar und wird nicht gerastert', async ({ page }) => {
  await page.getByLabel('Deckungsskala').selectOption('percent')
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  const feld = page.getByRole('textbox', { name: 'Deckung von Quercus species' })
  await feld.fill('23')
  await feld.blur()
  // Die Stufen sind eine Abkürzung, keine Einschränkung.
  await expect(feld).toHaveValue('23')
  await page.getByRole('button', { name: /erhöhen/ }).click()
  await expect(feld).toHaveValue('25')
})

test('ein Prozentwert ohne passende Klasse bleibt sichtbar', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await page.getByRole('combobox', { name: 'Deckung von Quercus species' }).selectOption('2')
  // 15 % ist in der klassischen Skala die Klasse 2; in der erweiterten
  // liegt zwischen 2a (10 %) und 2b (20 %) nichts. Der Wert zählt
  // trotzdem für die Auswertung und darf nicht unsichtbar werden.
  await page.getByLabel('Deckungsskala').selectOption('bb-extended')
  await expect(page.getByRole('row', { name: /Quercus species/ })).toContainText('15 %')
})

test('eine Art lässt sich wieder entfernen', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Quercus species')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Quercus species entfernen' }).click()
  await expect(page.getByRole('row', { name: /Quercus species/ })).toHaveCount(0)
})

test('ein Ausfall von hostus blockiert die Erfassung nicht', async ({ page }) => {
  await page.route('https://hostus.test/v1/suggest*', (route) => route.fulfill({ status: 502, body: 'weg' }))
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca')
  await expect(page.getByText('Vorschläge nicht verfügbar — Name von Hand eingeben.')).toBeVisible()
  await input.press('Enter')
  await expect(page.getByRole('row', { name: /Festuca/ })).toBeVisible()
})

test('die Artensuche gibt hostus die Region des Fundorts mit', async ({ page }) => {
  const anfragen = []
  await page.route('https://hostus.test/v1/suggest*', (route) => {
    anfragen.push(new URL(route.request().url()))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) })
  })

  // Ohne Koordinate kennt der Plot keine Region: erst der Fundort, dann
  // die Suche.
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  await expect(page.getByLabel('Ökoregion')).toHaveValue('654')

  await page.getByLabel('Art suchen').fill('Festuca')
  await expect.poll(() => anfragen.length).toBeGreaterThan(0)

  const p = anfragen.at(-1).searchParams
  // Die TDWG-Region aus den Kopfdaten — nicht das Länderkürzel, das an
  // habitatus geht.
  expect(p.get('area')).toBe('GER')
  expect(p.get('target_space')).toBe('eurosl')
  expect(p.get('require_target_space')).toBe('true')
})

test('der Übernehmen-Knopf nimmt auch Namen ohne Vorschlag', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  // Ein Name, den die Vorschlagsliste nicht führt. Dass die Eingabetaste
  // ihn trotzdem übernimmt, sieht man ihr nicht an — der Knopf sagt es.
  await input.fill('Hieracium spec.')
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.locator('td[data-label="Art"]')).toContainText('Hieracium spec.')
  // Danach ist das Feld frei für die nächste Art.
  await expect(input).toHaveValue('')
})

test('der Übernehmen-Knopf nimmt den hervorgehobenen Vorschlag', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca')
  await expect(page.getByRole('listbox')).toBeVisible()
  await input.press('ArrowDown')
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  // Derselbe Weg wie die Eingabetaste: der markierte Vorschlag gewinnt
  // gegen den Freitext.
  await expect(page.locator('td[data-label="Art"]')).toContainText('Festuca ovina')
})

test('der Artname in der Erfassungsliste steht kursiv', async ({ page }) => {
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca ovina aggr.')
  await input.press('Enter')
  const zelle = page.locator('td[data-label="Art"]')
  // "aggr." benennt ein Sammeltaxon und bleibt aufrecht.
  await expect(zelle.locator('i')).toHaveText(['Festuca', 'ovina'])
  await expect(zelle).toContainText('aggr.')
})
