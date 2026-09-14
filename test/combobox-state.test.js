import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createComboboxState, OPTION_ID_PREFIX } from '../src/combobox-state.js'

const OPTIONEN = [
  { conceptId: 'eurosl:1', name: 'Festuca ovina', isEuroSl: true },
  { conceptId: 'wcvp:2', name: 'Festuca rubra', isEuroSl: false },
  { conceptId: 'cdm:3', name: 'Festuca pallens', isEuroSl: false },
]

test('anfangs ist die Liste zu und nichts ausgewählt', () => {
  const c = createComboboxState()
  assert.deepEqual(c.getState(), { query: '', options: [], open: false, activeIndex: -1, activeId: null })
})

test('Optionen öffnen die Liste, ohne etwas vorzuwählen', () => {
  // Eine Vorauswahl würde bei Enter einen Namen übernehmen, den der Nutzer
  // nie angesehen hat.
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  assert.equal(c.getState().open, true)
  assert.equal(c.getState().activeIndex, -1)
})

test('eine leere Ergebnisliste hält die Liste geschlossen', () => {
  const c = createComboboxState()
  c.setOptions([])
  assert.equal(c.getState().open, false)
})

test('Pfeil nach unten wandert von oben nach unten', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(1)
  assert.equal(c.getState().activeIndex, 0)
  c.move(1)
  assert.equal(c.getState().activeIndex, 1)
})

test('die Auswahl läuft an beiden Enden um', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(-1)
  assert.equal(c.getState().activeIndex, 2)
  c.move(1)
  assert.equal(c.getState().activeIndex, 0)
})

test('activeId benennt die aktive Option für aria-activedescendant', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(1)
  assert.equal(c.getState().activeId, `${OPTION_ID_PREFIX}0`)
})

test('ohne Auswahl ist activeId null', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  assert.equal(c.getState().activeId, null)
})

test('pick liefert die aktive Option und schließt die Liste', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(1)
  assert.deepEqual(c.pick(), OPTIONEN[0])
  assert.equal(c.getState().open, false)
})

test('pick ohne Auswahl liefert null und schließt nicht', () => {
  // Enter ohne Auswahl übernimmt den Freitext — das entscheidet die Ansicht,
  // nicht dieser Zustand.
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  assert.equal(c.pick(), null)
  assert.equal(c.getState().open, true)
})

test('select wählt direkt aus, für den Mausklick', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.select(2)
  assert.equal(c.getState().activeIndex, 2)
  assert.deepEqual(c.pick(), OPTIONEN[2])
})

test('ein Index außerhalb der Liste wird ignoriert', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.select(9)
  assert.equal(c.getState().activeIndex, -1)
})

test('close schließt und hebt die Auswahl auf', () => {
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(1)
  c.close()
  assert.equal(c.getState().open, false)
  assert.equal(c.getState().activeIndex, -1)
})

test('eine neue Eingabe verwirft die alte Auswahl', () => {
  // Sonst zeigt aria-activedescendant auf eine Option, die es nicht mehr gibt.
  const c = createComboboxState()
  c.setOptions(OPTIONEN)
  c.move(1)
  c.setQuery('Ammo')
  assert.equal(c.getState().activeIndex, -1)
  assert.equal(c.getState().query, 'Ammo')
})

test('move bei zugeklappter Liste tut nichts', () => {
  const c = createComboboxState()
  c.move(1)
  assert.equal(c.getState().activeIndex, -1)
})
