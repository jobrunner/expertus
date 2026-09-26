// Was nach einer Auswertung über den erkannten Habitattyp zu sehen ist.
// Ein Code wie "R1A" sagt im Gelände wenig — Name und Beschreibung sind der
// Grund für diesen Abschnitt.
import { test, expect } from '@playwright/test'
import { stubServices } from './helpers/stubs.js'

// Derselbe Weg wie in result.spec.js: erst die Koordinate, damit ortus die
// Kopfdaten liefert, dann eine Art mit Deckung — vorher bleibt der
// Auswerten-Knopf gesperrt.
async function auswerten(page) {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  await expect(page.getByRole('row', { name: /Land/ })).toContainText('aus ortus')
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca ovina')
  await input.press('Enter')
  await page.getByLabel('Deckung von Festuca ovina').selectOption('3')
  await page.getByRole('button', { name: 'Auswerten' }).click()
}

test.beforeEach(async ({ page }) => {
  await stubServices(page)
})

test('nach der Auswertung stehen Name und Beschreibung des Habitattyps da', async ({ page }) => {
  await auswerten(page)
  await expect(page.getByRole('heading', { name: 'Semi-dry perennial calcareous grassland (meadow steppe)' })).toBeVisible()
  await expect(page.getByText('Artenreiche Halbtrockenrasen basenreicher Böden.')).toBeVisible()
  // Die Beschreibung ist zitiert, nicht selbst formuliert.
  await expect(page.getByText(/floraveg:eunis-habitat-factsheets/)).toBeVisible()
})

test('die Pflanzengesellschaften stehen in einem Akkordeon', async ({ page }) => {
  await auswerten(page)
  const akkordeon = page.locator('details', { hasText: 'Pflanzengesellschaften' })
  await expect(akkordeon).toBeVisible()
  // Zugeklappt, bis der Inhalt gebraucht wird.
  await expect(akkordeon).not.toHaveAttribute('open', '')
  await expect(page.getByText('Cirsio-Brachypodion pinnati')).toBeHidden()
  await akkordeon.getByText(/Pflanzengesellschaften/).click()
  await expect(page.getByText('Cirsio-Brachypodion pinnati')).toBeVisible()
  // Der Autor gehört zum Namen einer Pflanzengesellschaft.
  await expect(akkordeon.getByText(/Hadač et Klika 1944/)).toBeVisible()
})

test('die Arten stehen nach ihren Rollen gruppiert', async ({ page }) => {
  await auswerten(page)
  await page.getByText(/Arten des Habitattyps/).click()
  const inhalt = page.locator('details', { hasText: 'Arten des Habitattyps' })
  // Reihenfolge wie im Auftrag: diagnostisch, konstant, dominant.
  await expect(inhalt.getByRole('heading', { level: 5 })).toHaveText([
    'diagnostisch (1)', 'konstant (1)', 'dominant (1)',
  ])
  await expect(inhalt.getByText('Bromus erectus')).toBeVisible()
  // Treue und Stetigkeit sind verschiedene Maße und stehen ausgeschrieben.
  await expect(inhalt.getByText(/Treue 21/)).toBeVisible()
  await expect(inhalt.getByText(/Stetigkeit 18/)).toBeVisible()
})

test('ein Ausfall von situs lässt das Ergebnis stehen', async ({ page }) => {
  await stubServices(page, { situs: { status: 502, contentType: 'application/json', body: '{}' } })
  await auswerten(page)
  // Das Ergebnis der Auswertung bleibt sichtbar — eingegrenzt auf den
  // Abschnitt, weil derselbe Code auch in der Live-Region steht, die das
  // Ergebnis ansagt.
  // .first(): der Code steht auch im aufklappbaren Anhang, der zeigt, wie
  // das Ergebnis zustande kam. Gemeint ist die Ergebniszeile, und die
  // steht zuerst.
  await expect(page.locator('strong', { hasText: 'R1A' }).first()).toBeVisible()
  // … und der Ausfall bleibt eine Randnotiz, keine Fehlermeldung über der Maske.
  await expect(page.getByText('Angaben zum Habitattyp nicht verfügbar.')).toBeVisible()
})

test('ein Ausfall von situs führt nicht zu einer Anfrageschleife', async ({ page }) => {
  // Genau das war der Fall: der Abruf hängt am Zeichnen, und der Fehler
  // löste ein Neuzeichnen aus. Ohne Sperre liefen daraus Dutzende Anfragen
  // in Sekunden gegen einen Dienst, der ohnehin schon ausgefallen ist.
  // Nach stubServices registriert: bei gleichem Muster gewinnt in
  // Playwright die zuletzt eingerichtete Route.
  const anfragen = []
  await page.route('https://situs.test/v1/habitat-type/**', (route) => {
    anfragen.push(route.request().url())
    return route.fulfill({ status: 502, contentType: 'application/json', body: '{}' })
  })
  await auswerten(page)
  await expect(page.getByText('Angaben zum Habitattyp nicht verfügbar.')).toBeVisible()
  await page.waitForTimeout(1000)
  expect(anfragen.length).toBe(1)

  // Auf Zuruf wird es ein zweites Mal versucht — und bleibt dann wieder
  // stehen.
  await page.getByRole('button', { name: 'Erneut versuchen' }).click()
  await page.waitForTimeout(1000)
  expect(anfragen.length).toBe(2)
})

test('einen unbekannten Typ meldet die Maske als Auskunftslücke', async ({ page }) => {
  await stubServices(page, { situs: { status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) } })
  await auswerten(page)
  await expect(page.getByText('Zu R1A liegen keine Angaben vor.')).toBeVisible()
})

test('ein wieder geöffneter Plot holt die Angaben erneut', async ({ page }) => {
  // Das Ergebnis liegt gespeichert vor, die Angaben dazu nicht: sie sind
  // Nachschlagedaten und stehen nur im Zustand. Genau deshalb hängt der
  // Abruf nicht allein an evaluate().
  await auswerten(page)
  await expect(page.getByRole('heading', { name: /Semi-dry perennial/ })).toBeVisible()
  const adresse = page.url()

  // Neu laden, nicht nur zur Liste und zurück: die Angaben stehen im
  // Zustand, und der überlebt einen Hash-Wechsel. Erst ein echter Neustart
  // zeigt, ob sie beim Öffnen wieder geholt werden.
  await page.goto('about:blank')
  await page.goto(adresse)
  await expect(page.getByRole('heading', { name: /Semi-dry perennial/ })).toBeVisible()
})
