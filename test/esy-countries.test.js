import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESY_COUNTRIES, ESY_COUNTRY_NAMES, esyCountryFor } from '../src/esy-countries.js'

test('das Vokabular hat genau 52 Länder', () => {
  assert.equal(Object.keys(ESY_COUNTRIES).length, 52)
  assert.equal(ESY_COUNTRY_NAMES.length, 52)
})

test('ISO-Code wird auf den ESy-Namen abgebildet', () => {
  assert.equal(esyCountryFor('DE'), 'Germany')
  assert.equal(esyCountryFor('de'), 'Germany')
})

test('ESy verlangt historische und Langformen', () => {
  assert.equal(esyCountryFor('CZ'), 'Czech Republic')
  assert.equal(esyCountryFor('SK'), 'Slovak Republic')
  assert.equal(esyCountryFor('RU'), 'Russian Federation')
  assert.equal(esyCountryFor('BA'), 'Bosnia-Herzegovina')
})

test('GB wird auf United Kingdom abgebildet, nicht auf Britain', () => {
  // Das Regelwerk 2025 kennt beide Werte. Alle Britain-Vorkommen stehen in
  // positiven ODER-Ketten, alle Ausschlüsse nutzen United Kingdom: mit
  // United Kingdom fehlen neun U-Regeln, mit Britain greifen Ausschlüsse
  // nicht. Fehlende Treffer sind dem stillen Falschtreffer vorzuziehen.
  assert.equal(esyCountryFor('GB'), 'United Kingdom')
  assert.equal(ESY_COUNTRY_NAMES.includes('Britain'), false)
})

test('ein Land außerhalb des Vokabulars liefert null', () => {
  assert.equal(esyCountryFor('US'), null)
  assert.equal(esyCountryFor(''), null)
  assert.equal(esyCountryFor(undefined), null)
})

test('die Namensliste ist sortiert und frei von Dubletten', () => {
  assert.deepEqual(ESY_COUNTRY_NAMES, [...ESY_COUNTRY_NAMES].sort())
  assert.equal(new Set(ESY_COUNTRY_NAMES).size, ESY_COUNTRY_NAMES.length)
})
