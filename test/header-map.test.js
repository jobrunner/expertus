import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveHeader, HEADER_FIELDS, missingFields, COAST_VALUES, DUNE_VALUES } from '../src/header-map.js'
import { loadFixture } from './helpers/fixtures.js'

test('die sieben Pflichtfelder heißen exakt wie in habitatus', () => {
  assert.deepEqual(HEADER_FIELDS, [
    'Country', 'Coast_EEA', 'Dunes_Bohn', 'Ecoreg', 'Altitude (m)', 'DEG_LAT', 'DEG_LON',
  ])
})

test('Berlin ergibt vollständige Kopfdaten, alle aus ortus', () => {
  const { header, origin } = deriveHeader(loadFixture('berlin'))
  assert.equal(header.Country, 'Germany')
  assert.equal(header.Coast_EEA, 'N_COAST')
  assert.equal(header.Dunes_Bohn, 'N_DUNES')
  assert.equal(header.Ecoreg, 654)
  assert.equal(header['Altitude (m)'], 36)
  assert.equal(header.DEG_LAT, 52.52)
  assert.equal(header.DEG_LON, 13.405)
  assert.deepEqual(missingFields(origin), [])
  for (const f of HEADER_FIELDS) assert.equal(origin[f], 'ortus', f)
})

test('Belege werden mitgeführt, aber nicht als Kopfdatum', () => {
  const { header, evidence } = deriveHeader(loadFixture('sylt'))
  assert.equal(header.Coast_EEA, 'ATL_COAST')
  assert.equal(evidence.seaRegion, 'North East Atlantic Ocean')
  assert.equal(evidence.ecoName, 'European Atlantic mixed forests')
  assert.equal('sea_region' in header, false)
})

test('fehlende Ecoregion-Quelle wird als missing gemeldet, nicht geraten', () => {
  const { header, origin } = deriveHeader(loadFixture('ostsee-darss'))
  assert.equal(header.Ecoreg, null)
  assert.equal(origin.Ecoreg, 'missing')
  assert.deepEqual(missingFields(origin), ['Ecoreg'])
  // Die Küste ist dort sehr wohl ableitbar — ein fehlendes Feld darf die
  // anderen nicht mitreißen.
  assert.equal(header.Coast_EEA, 'BAL_COAST')
  assert.equal(origin.Coast_EEA, 'ortus')
})

test('ein Land außerhalb des ESy-Vokabulars ist missing, nicht der ISO-Code', () => {
  const { header, origin } = deriveHeader(loadFixture('tel-aviv'))
  assert.equal(header.Country, null)
  assert.equal(origin.Country, 'missing')
  // Außerhalb der EEA-Abdeckung fehlen auch Küste und Dünen.
  assert.deepEqual(missingFields(origin).sort(), ['Coast_EEA', 'Country', 'Dunes_Bohn'])
})

test('ohne Gazetteer-Abdeckung fehlen Land und Höhe', () => {
  const { header, origin } = deriveHeader(loadFixture('new-york'))
  assert.equal(header.Country, null)
  assert.equal(header['Altitude (m)'], null)
  assert.equal(origin['Altitude (m)'], 'missing')
  // Die Ecoregion greift auch dort — sie ist weltweit abgedeckt.
  assert.equal(header.Ecoreg, 339)
  assert.equal(origin.Ecoreg, 'ortus')
})

test('Höhe null Meter ist ein Wert, kein fehlendes Feld', () => {
  const doc = loadFixture('berlin')
  doc.gazetteer.elevation.meters = 0
  const { header, origin } = deriveHeader(doc)
  assert.equal(header['Altitude (m)'], 0)
  assert.equal(origin['Altitude (m)'], 'ortus')
})

test('Koordinate kommt aus der Antwort, nicht aus der Anfrage', () => {
  const { header } = deriveHeader(loadFixture('sylt'))
  assert.equal(header.DEG_LAT, 54.9)
  assert.equal(header.DEG_LON, 8.31)
})

test('ein Wert außerhalb des Vokabulars wird verworfen, nicht durchgereicht', () => {
  const doc = loadFixture('berlin')
  doc.results.find((r) => r.source_id === 'coast-eea-2022').features[0].properties.coast_eea = 'SEE_COAST'
  const { header, origin } = deriveHeader(doc)
  assert.equal(header.Coast_EEA, null)
  assert.equal(origin.Coast_EEA, 'missing')
})

test('die Vokabulare sind vollständig', () => {
  assert.deepEqual(COAST_VALUES, ['ARC_COAST', 'ATL_COAST', 'BAL_COAST', 'BLA_COAST', 'MED_COAST', 'N_COAST'])
  assert.deepEqual(DUNE_VALUES, ['N_DUNES', 'Y_DUNES'])
})

test('eine leere Antwort führt zu sieben missing, nicht zu einem Absturz', () => {
  const { header, origin } = deriveHeader({ results: [] })
  assert.equal(missingFields(origin).length, 7)
  assert.equal(header.Country, null)
})
