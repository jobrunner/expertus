// Die Fixture ist eine echte Antwort von situs zu R55 (abgerufen
// 2026-09-24), auf drei Arten je Rolle und drei Syntaxa gekürzt. Struktur
// und Feldnamen sind unverändert — an erfundenen Antworten hätte sich
// schon einmal eine falsche Annahme festgesetzt (siehe hostus).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSitus, ROLLEN } from '../../src/adapters/situs.js'
import { createFakeFetch } from '../helpers/fake-fetch.js'
import { loadFixture } from '../helpers/fixtures.js'

const BASE = 'https://situs.example.org'
const R55 = loadFixture('r55', 'situs')

test('der Habitattyp wird unter der EUNIS-2021-Typologie abgefragt', async () => {
  const calls = []
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }, calls) })
  await s.habitatType('R55')
  // Die Typologie gehört kodiert in den Pfad: das @ ist in einem
  // Pfadsegment sonst mehrdeutig.
  assert.equal(calls[0].url, `${BASE}/v1/habitat-type/eunis%402021/R55`)
})

test('Name, Beschreibung und Quelle kommen heraus', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }) })
  const h = await s.habitatType('R55')
  assert.equal(h.code, 'R55')
  assert.equal(h.name, 'Lowland moist or wet tall-herb and fern fringe')
  assert.match(h.beschreibung, /^Tall-herb and fern-dominated communities/)
  // Die Beschreibung ist zitiert, nicht selbst formuliert — die Herkunft
  // gehört mit angezeigt.
  assert.equal(h.quelle, 'floraveg:eunis-habitat-factsheets:2021-06-01')
})

test('die Arten stehen unter allen drei Rollen', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }) })
  const h = await s.habitatType('R55')
  assert.deepEqual(Object.keys(h.arten), ROLLEN.map(([k]) => k))
  assert.equal(h.arten.diagnostic[0].name, 'Urtica dioica')
  assert.equal(h.arten.diagnostic[0].fidelity, 16)
  assert.equal(h.arten.constant[0].constancy, 19)
})

test('eine Rolle ohne Arten bleibt eine leere Liste, kein undefined', async () => {
  const ohne = { ...R55, species: { constant: R55.species.constant } }
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: ohne }) })
  const h = await s.habitatType('R55')
  assert.deepEqual(h.arten.dominant, [])
  assert.deepEqual(h.arten.diagnostic, [])
})

test('die Syntaxa behalten Rang und Autor', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }) })
  const h = await s.habitatType('R55')
  assert.equal(h.syntaxa.length, 3)
  assert.equal(h.syntaxa[0].rang, 'alliance')
  assert.ok(h.syntaxa[0].name)
  assert.ok(h.syntaxa[0].autor)
})

test('einen unbekannten Code meldet situs mit 404 — das ist kein Fehler', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ status: 404, json: { error: { code: 'NOT_FOUND' } } }) })
  // Das Ergebnis der Auswertung steht trotzdem; nur das Nachschlagewerk
  // kennt diesen Typ nicht. Ein geworfener Fehler würde die ganze
  // Ergebnisansicht mit einer Meldung überziehen.
  assert.equal(await s.habitatType('ZZ99'), null)
})

test('ohne Adresse wird gar nicht erst gefragt', async () => {
  const calls = []
  const s = createSitus({ baseUrl: '', fetch: createFakeFetch({ json: R55 }, calls) })
  assert.equal(await s.habitatType('R55'), null)
  assert.equal(calls.length, 0)
})

test('ohne Code wird gar nicht erst gefragt', async () => {
  const calls = []
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }, calls) })
  assert.equal(await s.habitatType(null), null)
  assert.equal(calls.length, 0)
})

test('5xx ist ein Dienstfehler', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ status: 502, text: 'kaputt' }) })
  await assert.rejects(() => s.habitatType('R55'), (err) => err.service === 'situs')
})

test('aus einem Aggregat abgeleitete Arten erscheinen nicht', async () => {
  const s = createSitus({ baseUrl: BASE, fetch: createFakeFetch({ json: R55 }) })
  const h = await s.habitatType('R55')
  // situs leitet aus einem Sammeltaxon dessen Einzelarten ab. Sie sagen
  // nichts, was das Aggregat nicht schon sagt, und füllen die Liste: bei
  // R22 sind 76 von 161 Einträgen solche Ableitungen.
  const namen = h.arten.constant.map((a) => a.name)
  assert.ok(!namen.includes('Achillea apiculata'))
  assert.ok(namen.includes('Aegopodium podagraria'))
})
