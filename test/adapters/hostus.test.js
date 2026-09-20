import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHostus, stripCounterSuffix } from '../../src/adapters/hostus.js'
import { createFakeFetch } from '../helpers/fake-fetch.js'

const BASE = 'https://hostus.example.org'

// Nachgebildet nach einer echten Antwort von hostus (geprüft 2026-09-20,
// q=Festuca ovina). Entscheidend: die Kennungen tragen die Präfixe cdm,
// wcvp und germansl — niemals eurosl. Der EuroSL-Name steht in
// target_space_name und weicht oft vom eigenen Namen des Konzepts ab.
const ANSWER = {
  backbone_versions: { cdm: '2026-08-02', eurosl: '2024-11-03', wcvp: '2026-06-15' },
  results: [
    { concept_id: 'wcvp:concept:451511', display: 'Festuca ovina', canonical: 'Festuca ovina', target_space_name: 'Festuca ovina subsp. maroccana', rank: 'SPECIES', status: 'ACCEPTED', in_area: false, score: -6.2 },
    { concept_id: 'cdm:concept:dec0524b', display: 'Festuca niphobia', canonical: 'Festuca niphobia', target_space_name: 'Festuca ovina subvar. niphobia.1', rank: 'SPECIES', status: 'ACCEPTED', in_area: true, score: -7.6 },
    { concept_id: 'germansl:concept:0082682b', display: 'Festuca pallens', canonical: 'Festuca pallens', target_space_name: 'Festuca pallens', rank: 'SPECIES', status: 'SYNONYM', in_area: false, score: -6.3, sec: { id: 'x', title: 'Flora Europaea' } },
  ],
}

test('die Suchanfrage fragt gezielt nach EuroSL-Namen', async () => {
  const calls = []
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }, calls) })
  await h.suggest('Festuca ovina', { limit: 20 })
  const url = new URL(calls[0].url)
  assert.equal(url.searchParams.get('q'), 'Festuca ovina')
  assert.equal(url.searchParams.get('limit'), '20')
  // Ohne diese beiden Parameter liefert hostus dasselbe Taxon einmal je
  // Referenzwerk, und kein Treffer trägt einen EuroSL-Namen.
  assert.equal(url.searchParams.get('target_space'), 'eurosl')
  assert.equal(url.searchParams.get('require_target_space'), 'true')
})

test('ohne Gebiet wird kein area-Parameter gesetzt', async () => {
  const calls = []
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }, calls) })
  await h.suggest('Festuca ovina')
  assert.equal(new URL(calls[0].url).searchParams.has('area'), false)
})

test('die TDWG-Region wird als area mitgegeben', async () => {
  const calls = []
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }, calls) })
  await h.suggest('Festuca ovina', { area: 'GER' })
  assert.equal(new URL(calls[0].url).searchParams.get('area'), 'GER')
})

test('Treffer im Gebiet stehen oben', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca ovina', { area: 'GER' })
  assert.equal(out[0].inArea, true)
  assert.equal(out[0].conceptId, 'cdm:concept:dec0524b')
})

test('angezeigt wird der EuroSL-Name, nicht der Name des Konzepts', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca ovina')
  const treffer = out.find((o) => o.conceptId === 'wcvp:concept:451511')
  // Genau dieser Name geht später an habitatus.
  assert.equal(treffer.name, 'Festuca ovina subsp. maroccana')
  assert.equal(treffer.matchedName, 'Festuca ovina')
})

test('stimmen beide Namen überein, gibt es keine Herkunftsangabe', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca ovina')
  assert.equal(out.find((o) => o.name === 'Festuca pallens').matchedName, null)
})

test('jeder Treffer bleibt sichtbar — gefiltert hat schon der Dienst', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  assert.equal((await h.suggest('Festuca')).length, 3)
})

test('kein Treffer wird mehr nach dem Präfix seiner Kennung beurteilt', async () => {
  // Das war die Ursache des Fehlers: die Präfixe lauten cdm, wcvp und
  // germansl, nie eurosl — die Prüfung schlug also immer negativ aus.
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  for (const o of await h.suggest('Festuca')) {
    assert.equal('isEuroSl' in o, false)
    assert.equal('backbone' in o, false)
  }
})

test('der EuroSL-Zähler wird abgeschnitten, sonst trifft der Name nichts', () => {
  assert.equal(stripCounterSuffix('Festuca ovina.1'), 'Festuca ovina')
  assert.equal(stripCounterSuffix('Festuca ovina.12'), 'Festuca ovina')
  assert.equal(stripCounterSuffix('Festuca ovina'), 'Festuca ovina')
  // Kein Zähler: ein abgekürztes Epitheton darf nicht verstümmelt werden.
  assert.equal(stripCounterSuffix('Quercus robur subsp. robur'), 'Quercus robur subsp. robur')
  assert.equal(stripCounterSuffix('Festuca ovina aggr.'), 'Festuca ovina aggr.')
})

test('der EuroSL-Zähler wird auch am übernommenen Namen abgeschnitten', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  const treffer = out.find((o) => o.conceptId === 'cdm:concept:dec0524b')
  // target_space_name lautet "…niphobia.1"; mit dem Zähler trifft der Name
  // in ESy nichts.
  assert.equal(treffer.name, 'Festuca ovina subvar. niphobia')
})

test('Rang, Status und Sekundärquelle bleiben erhalten', async () => {
  const h = createHostus({ baseUrl: BASE, fetch: createFakeFetch({ json: ANSWER }) })
  const out = await h.suggest('Festuca')
  const cdm = out.find((s) => s.conceptId.startsWith('germansl:'))
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
