import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHostus, stripCounterSuffix } from '../../src/adapters/hostus.js'
import { createFakeFetch } from '../helpers/fake-fetch.js'

const BASE = 'https://hostus.example.org'

const ANSWER = {
  backbone_versions: { eurosl: '2024-11-03', wcvp: '2026-06-15' },
  results: [
    { concept_id: 'wcvp:concept:451511', display: 'Festuca ovina', canonical: 'Festuca ovina', rank: 'SPECIES', status: 'ACCEPTED', in_area: false, score: -6.2 },
    { concept_id: 'eurosl:concept:dec0524b', display: 'Festuca ovina.1', canonical: 'Festuca ovina.1', rank: 'SPECIES', status: 'ACCEPTED', in_area: true, score: -7.6 },
    { concept_id: 'cdm:concept:0082682b', display: 'Festuca pallens', canonical: 'Festuca pallens', rank: 'SPECIES', status: 'SYNONYM', in_area: false, score: -6.3, sec: { id: 'x', title: 'Flora Europaea' } },
  ],
}

test('die Suchanfrage wird kodiert und mit limit gestellt', async () => {
  const calls = []
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }, calls) })
  await h.suggest('Festuca ovina', { limit: 20 })
  assert.equal(calls[0].url, `${BASE}/v1/suggest?q=Festuca%20ovina&limit=20`)
})

test('EuroSL-Treffer stehen oben, der Rest bleibt sichtbar', async () => {
  // Ein harter Filter würde die Liste heute leeren: hostus wertet
  // backbone= noch nicht aus und verdrängt EuroSL im Ranking.
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  assert.equal(out.length, 3)
  assert.equal(out[0].isEuroSl, true)
  assert.equal(out.filter((s) => s.isEuroSl).length, 1)
})

test('der Backbone wird aus dem concept_id-Präfix gelesen', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  assert.deepEqual(out.map((s) => s.backbone), ['eurosl', 'wcvp', 'cdm'])
})

test('der EuroSL-Zähler wird abgeschnitten, sonst trifft der Name nichts', () => {
  assert.equal(stripCounterSuffix('Festuca ovina.1'), 'Festuca ovina')
  assert.equal(stripCounterSuffix('Festuca ovina.12'), 'Festuca ovina')
  assert.equal(stripCounterSuffix('Festuca ovina'), 'Festuca ovina')
  // Kein Zähler: ein abgekürztes Epitheton darf nicht verstümmelt werden.
  assert.equal(stripCounterSuffix('Quercus robur subsp. robur'), 'Quercus robur subsp. robur')
  assert.equal(stripCounterSuffix('Festuca ovina aggr.'), 'Festuca ovina aggr.')
})

test('der Name eines EuroSL-Treffers ist um den Zähler bereinigt', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  assert.equal(out[0].name, 'Festuca ovina')
  assert.equal(out[0].conceptId, 'eurosl:concept:dec0524b')
})

test('Rang, Status und Sekundärquelle bleiben erhalten', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  const cdm = out.find((s) => s.backbone === 'cdm')
  assert.equal(cdm.status, 'SYNONYM')
  assert.equal(cdm.rank, 'SPECIES')
  assert.equal(cdm.secTitle, 'Flora Europaea')
})

test('eine leere Suche fragt den Dienst gar nicht erst', async () => {
  let gerufen = false
  const h = createHostus({ baseUrl: BASE, fetch: () => ((gerufen = true), Promise.reject(new Error('nie'))) })
  assert.deepEqual(await h.suggest('  '), [])
  assert.equal(gerufen, false)
})

test('eine Antwort ohne results ist eine leere Liste, kein Absturz', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: { backbone_versions: {} } }) })
  assert.deepEqual(await h.suggest('Festuca'), [])
})

test('5xx ist ein Dienstfehler', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ status: 502, text: 'bad gateway' }) })
  await assert.rejects(() => h.suggest('Festuca'), (err) => {
    assert.equal(err.kind, 'service')
    return true
  })
})

test('ein Abbruch bleibt ein AbortError', async () => {
  const h = createHostus({
    baseUrl: BASE,
    fetch: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
  })
  await assert.rejects(() => h.suggest('Festuca'), (err) => {
    assert.equal(err.name, 'AbortError')
    return true
  })
})
