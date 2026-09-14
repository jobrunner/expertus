import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadFixture } from './helpers/fixtures.js'

test('Berlin ist der vollständige Normalfall', () => {
  const d = loadFixture('berlin')
  assert.equal(d.gazetteer.admin.country_iso, 'DE')
  assert.equal(typeof d.gazetteer.elevation.meters, 'number')
  assert.equal(sourceOf(d, 'ecoregions-2017')[0].properties.ECO_ID, 654)
  assert.equal(sourceOf(d, 'coast-eea-2022')[0].properties.coast_eea, 'N_COAST')
  assert.equal(sourceOf(d, 'bohn-dunes-2019')[0].properties.dunes_bohn, 'N_DUNES')
})

test('Sylt liegt an der atlantischen Küste', () => {
  const d = loadFixture('sylt')
  assert.equal(sourceOf(d, 'coast-eea-2022')[0].properties.coast_eea, 'ATL_COAST')
})

test('am Darß fehlt die Ecoregion-Quelle vollständig', () => {
  const d = loadFixture('ostsee-darss')
  assert.deepEqual(sourceOf(d, 'ecoregions-2017'), [])
})

test('Tel Aviv liegt außerhalb der EEA-Abdeckung', () => {
  const d = loadFixture('tel-aviv')
  assert.equal(d.gazetteer.admin.country_iso, 'IL')
  assert.deepEqual(sourceOf(d, 'coast-eea-2022'), [])
  assert.deepEqual(sourceOf(d, 'bohn-dunes-2019'), [])
})

test('in New York kennt der Gazetteer weder Land noch Höhe', () => {
  const d = loadFixture('new-york')
  assert.equal(d.gazetteer.admin?.country_iso ?? null, null)
  assert.equal(d.gazetteer.elevation?.meters ?? null, null)
})

test('eine unbekannte Fixture ist ein Fehler, kein leeres Objekt', () => {
  assert.throws(() => loadFixture('gibtsnicht'))
})

function sourceOf(doc, sourceId) {
  const hit = doc.results.find((r) => r.source_id === sourceId)
  return hit?.features ?? []
}
