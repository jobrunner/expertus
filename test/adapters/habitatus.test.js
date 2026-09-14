import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHabitatus, buildRequest, IncompleteHeaderError } from '../../src/adapters/habitatus.js'
import { ServiceError } from '../../src/adapters/errors.js'
import { createFakeFetch } from '../helpers/fake-fetch.js'

const BASE = 'https://habitatus.example.org'

const HEADER = {
  Country: 'Germany',
  Coast_EEA: 'N_COAST',
  Dunes_Bohn: 'N_DUNES',
  Ecoreg: 654,
  'Altitude (m)': 36,
  DEG_LAT: 52.52,
  DEG_LON: 13.405,
}

const SPECIES = [
  { name: 'Festuca ovina', cover: 37.5, entry: 'suggest' },
  { name: 'Quercus species', cover: 2.5, entry: 'manual' },
]

const ANSWER = {
  result: 'R1A',
  matches: [{ code: 'R1A', variant: 'N15', priority: 4 }],
  resolution: [{ input: 'Festuca ovina', after_backbone: 'Festuca ovina', final: 'Festuca ovina aggr.', resolved: true }],
  versions: { rulepack: '2025-10-03', mode: 'repaired' },
  truncated_at_10: false,
}

test('der Request trägt genau die vier erlaubten Schlüssel', () => {
  const req = buildRequest({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  assert.deepEqual(Object.keys(req).sort(), ['backbone', 'header', 'records'])
})

test('der Backbone ist immer euro+med', () => {
  assert.equal(buildRequest({ header: HEADER, species: SPECIES, sampleId: 'P-1' }).backbone, 'euro+med')
})

test('alle Headerwerte sind Strings', () => {
  const { header } = buildRequest({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  for (const [k, v] of Object.entries(header)) assert.equal(typeof v, 'string', k)
  assert.equal(header.Ecoreg, '654')
  assert.equal(header['Altitude (m)'], '36')
  assert.equal(header.DEG_LAT, '52.52')
})

test('die Sample-ID wird als Dataset mitgegeben', () => {
  const { header } = buildRequest({ header: HEADER, species: SPECIES, sampleId: 'Sylt-03' })
  assert.equal(header.Dataset, 'Sylt-03')
})

test('records tragen nur name und cover', () => {
  const { records } = buildRequest({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  assert.deepEqual(records, [
    { name: 'Festuca ovina', cover: 37.5 },
    { name: 'Quercus species', cover: 2.5 },
  ])
})

test('kein zusätzliches Headerfeld schleicht sich ein', () => {
  const { header } = buildRequest({
    header: { ...HEADER, seaRegion: 'Baltic Sea' },
    species: SPECIES,
    sampleId: 'P-1',
  })
  assert.equal('seaRegion' in header, false)
})

test('ein fehlendes Kopfdatum wird vor dem Netzaufruf abgefangen', () => {
  assert.throws(() => buildRequest({ header: { ...HEADER, Ecoreg: null }, species: SPECIES, sampleId: 'P-1' }), (err) => {
    assert.ok(err instanceof IncompleteHeaderError)
    assert.deepEqual(err.fields, ['Ecoreg'])
    return true
  })
})

test('eine leere Artenliste wird vor dem Netzaufruf abgefangen', () => {
  assert.throws(() => buildRequest({ header: HEADER, species: [], sampleId: 'P-1' }), /Artenliste/)
})

test('eine Deckung außerhalb 0 bis 100 wird abgefangen', () => {
  const bad = [{ name: 'X', cover: 0, entry: 'manual' }]
  assert.throws(() => buildRequest({ header: HEADER, species: bad, sampleId: 'P-1' }), /Deckung/)
})

test('classify sendet POST mit JSON an den richtigen Pfad', async () => {
  const calls = []
  const h = createHabitatus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }, calls) })
  await h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  assert.equal(calls[0].url, `${BASE}/api/v1/classify`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.equal(JSON.parse(calls[0].options.body).backbone, 'euro+med')
})

test('die Antwort kommt in interner Schreibweise zurück, samt Request', async () => {
  const h = createHabitatus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  assert.equal(out.result, 'R1A')
  assert.equal(out.truncatedAt10, false)
  assert.equal(out.matches[0].code, 'R1A')
  assert.equal(out.resolution[0].afterBackbone, 'Festuca ovina')
  assert.equal(out.resolution[0].final, 'Festuca ovina aggr.')
  assert.equal(out.request.header.Dataset, 'P-1')
})

test('eine Antwort ohne Treffer ist gültig, nicht leer', async () => {
  const h = createHabitatus({
    baseUrl: BASE,
    fetch: createFakeFetch({ json: { ...ANSWER, result: '?', matches: null } }),
  })
  const out = await h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' })
  assert.equal(out.result, '?')
  assert.deepEqual(out.matches, [])
})

test('die 400-Meldung von habitatus wird wörtlich weitergereicht', async () => {
  // Sie benennt das beanstandete Feld. Jede Übersetzung nimmt dem Nutzer
  // genau die Information, mit der er den Fehler beheben kann.
  const h = createHabitatus({
    baseUrl: BASE,
    fetch: createFakeFetch({ status: 400, json: { error: 'unknown country "Deutschland"' } }),
  })
  await assert.rejects(() => h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' }), (err) => {
    assert.ok(err instanceof ServiceError)
    assert.equal(err.kind, 'request')
    assert.equal(err.message, 'unknown country "Deutschland"')
    return true
  })
})

test('5xx ist ein Dienstfehler', async () => {
  const h = createHabitatus({ baseUrl: BASE, fetch: createFakeFetch({ status: 500, text: 'boom' }) })
  await assert.rejects(() => h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' }), (err) => {
    assert.equal(err.kind, 'service')
    return true
  })
})

test('ein Netzfehler ist wiederholbar', async () => {
  const h = createHabitatus({ baseUrl: BASE, fetch: () => Promise.reject(new TypeError('Failed to fetch')) })
  await assert.rejects(() => h.classify({ header: HEADER, species: SPECIES, sampleId: 'P-1' }), (err) => {
    assert.equal(err.kind, 'network')
    assert.equal(err.retryable, true)
    return true
  })
})
