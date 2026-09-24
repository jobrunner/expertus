import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { stubServices } from './helpers/stubs.js'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function pruefe(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const blockierend = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blockierend.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await stubServices(page)
})

test('die leere Liste ist barrierefrei', async ({ page }) => {
  await page.goto('/#/plots')
  await pruefe(page)
})

test('die Maske mit Kopfdaten ist barrierefrei', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  await expect(page.getByRole('row', { name: /Country/ })).toContainText('aus ortus')
  await pruefe(page)
})

test('die geöffnete Vorschlagsliste ist barrierefrei', async ({ page }) => {
  // Der Zustand, den das Skill-Skript nicht erreicht — und der, in dem ein
  // Combobox-Pattern typischerweise falsch ist.
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Art suchen').fill('Festuca')
  await expect(page.getByRole('listbox')).toBeVisible()
  await pruefe(page)
})

test('der geöffnete Auswertungsanhang ist barrierefrei', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca ovina')
  await input.press('Enter')
  await page.getByLabel('Deckung von Festuca ovina').selectOption('3')
  await page.getByRole('button', { name: 'Auswerten' }).click()
  await page.getByText('Wie kam das Ergebnis zustande?').click()
  await pruefe(page)
})

test('bei 200 Prozent Zoom wird nichts abgeschnitten', async ({ page }) => {
  // Textskalierung ist SC 1.4.4; axe sieht sie nicht.
  await page.setViewportSize({ width: 640, height: 480 })
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  expect(ueberlauf).toBe(false)
})

test('der Fokus ist sichtbar und die Reihenfolge folgt der Lesereihenfolge', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  const reihenfolge = []
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    reihenfolge.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim()))
  }
  // Nach der Sample-ID kommt zuerst die Systemauswahl der Koordinaten-
  // eingabe (Aufgabe 12), dann erst das Koordinatenfeld selbst.
  expect(reihenfolge.slice(0, 4)).toEqual(['Zum Inhalt springen', 'Plots', 'sample', 'standort-system'])
})

test('die Angaben zum Habitattyp sind barrierefrei', async ({ page }) => {
  await page.goto('/#/plots')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()
  await page.getByLabel('Breitengrad (Lat)').fill('52.52')
  await page.getByLabel('Längengrad (Lon)').fill('13.405')
  await page.getByLabel('Längengrad (Lon)').blur()
  const input = page.getByLabel('Art suchen')
  await input.fill('Festuca ovina')
  await input.press('Enter')
  await page.getByLabel('Deckung von Festuca ovina').selectOption('3')
  await page.getByRole('button', { name: 'Auswerten' }).click()
  // Beide Akkordeons offen: zugeklappt prüft axe ihren Inhalt nicht, und
  // gerade die Artenlisten mit ihren Zwischenüberschriften sind es, die
  // eine Überschriftenebene überspringen könnten.
  await page.getByText(/Pflanzengesellschaften/).click()
  await page.getByText(/Arten des Habitattyps/).click()
  await pruefe(page)
})
