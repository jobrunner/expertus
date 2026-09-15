import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, markDirty, CollisionError } from '../src/storage.js'
import { createMemoryStorage } from './helpers/memory-storage.js'

// Die Uhr wird injiziert: ein Test, der von der echten Zeit abhängt,
// prüft die Zeit und nicht den Code.
function setup(times = ['2026-09-14T10:00:00.000Z']) {
  const backend = createMemoryStorage()
  let i = 0
  const now = () => times[Math.min(i++, times.length - 1)]
  return { backend, storage: createStorage({ backend, now }) }
}

function plotOf(sampleId, over = {}) {
  return {
    sampleId,
    coordinate: { lat: 52.52, lon: 13.405 },
    coordSource: 'manual',
    species: [{ name: 'Festuca ovina', cover: 37.5, entry: 'suggest' }],
    scale: 'bb-classic',
    evaluation: null,
    ...over,
  }
}

test('ein gespeicherter Plot kommt unverändert zurück', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1'))
  assert.equal(storage.load('P-1').species[0].name, 'Festuca ovina')
})

test('ein unbekannter Plot ist null, kein Fehler', () => {
  const { storage } = setup()
  assert.equal(storage.load('gibtsnicht'), null)
})

test('Speichern setzt updatedAt aus der Uhr', () => {
  const { storage } = setup(['2026-09-14T10:00:00.000Z'])
  assert.equal(storage.save(plotOf('P-1')).updatedAt, '2026-09-14T10:00:00.000Z')
})

test('createdAt bleibt beim zweiten Speichern erhalten', () => {
  const { storage } = setup(['2026-09-14T10:00:00.000Z', '2026-09-14T11:00:00.000Z'])
  const first = storage.save(plotOf('P-1'))
  const second = storage.save({ ...first, scale: 'percent' })
  assert.equal(second.createdAt, first.createdAt)
  assert.equal(second.updatedAt, '2026-09-14T11:00:00.000Z')
})

test('der Index trägt, was Liste und Suche brauchen', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1', { evaluation: { at: 'x', request: {}, response: { result: 'R1A' }, status: 'ok' } }))
  const [entry] = storage.list()
  assert.equal(entry.sampleId, 'P-1')
  assert.equal(entry.speciesCount, 1)
  assert.equal(entry.result, 'R1A')
  assert.equal(entry.status, 'ok')
  assert.equal(entry.lat, 52.52)
})

test('ein nie ausgewerteter Plot hat den Status none und kein Ergebnis', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1'))
  assert.equal(storage.list()[0].status, 'none')
  assert.equal(storage.list()[0].result, null)
})

test('die Liste steht neueste zuerst', () => {
  const { storage } = setup(['2026-09-14T10:00:00.000Z', '2026-09-14T12:00:00.000Z'])
  storage.save(plotOf('alt'))
  storage.save(plotOf('neu'))
  assert.deepEqual(storage.list().map((e) => e.sampleId), ['neu', 'alt'])
})

test('der Index lädt keine Plots nach', () => {
  // Der Index ist genau deshalb da: Liste und Suche dürfen nicht alle
  // Plots deserialisieren müssen.
  const { backend, storage } = setup()
  storage.save(plotOf('P-1'))
  const reader = createStorage({ backend, now: () => 'x' })
  const gelesen = []
  const original = backend.getItem.bind(backend)
  backend.getItem = (k) => (gelesen.push(k), original(k))
  reader.list()
  assert.deepEqual(gelesen, ['expertus.index'])
})

test('Löschen entfernt Plot und Indexeintrag', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1'))
  storage.remove('P-1')
  assert.equal(storage.load('P-1'), null)
  assert.deepEqual(storage.list(), [])
})

test('Umbenennen verschiebt Plot und Index', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1'))
  const renamed = storage.rename('P-1', 'Sylt-03')
  assert.equal(renamed.sampleId, 'Sylt-03')
  assert.equal(storage.load('P-1'), null)
  assert.equal(storage.load('Sylt-03').sampleId, 'Sylt-03')
  assert.deepEqual(storage.list().map((e) => e.sampleId), ['Sylt-03'])
})

test('Umbenennen auf eine belegte ID überschreibt nichts', () => {
  const { storage } = setup()
  storage.save(plotOf('P-1'))
  storage.save(plotOf('P-2'))
  assert.throws(() => storage.rename('P-1', 'P-2'), (err) => {
    assert.ok(err instanceof CollisionError)
    assert.equal(err.sampleId, 'P-2')
    return true
  })
  assert.equal(storage.load('P-1').sampleId, 'P-1')
})

test('Suche findet über Sample-ID, EUNIS-Code und Artnamen', () => {
  const { storage } = setup()
  storage.save(plotOf('Sylt-03', { species: [{ name: 'Ammophila arenaria', cover: 40, entry: 'suggest' }] }))
  storage.save(plotOf('Berlin-01', { evaluation: { at: 'x', request: {}, response: { result: 'R1A' }, status: 'ok' } }))
  assert.deepEqual(storage.search({ q: 'sylt' }).map((e) => e.sampleId), ['Sylt-03'])
  assert.deepEqual(storage.search({ q: 'ammophila' }).map((e) => e.sampleId), ['Sylt-03'])
  assert.deepEqual(storage.search({ q: 'R1A' }).map((e) => e.sampleId), ['Berlin-01'])
  assert.equal(storage.search({ q: '' }).length, 2)
})

test('Statusfilter grenzt ein, ohne die Freitextsuche zu ersetzen', () => {
  const { storage } = setup()
  storage.save(plotOf('A', { evaluation: { at: 'x', request: {}, response: { result: 'R1A' }, status: 'ok' } }))
  storage.save(plotOf('B'))
  assert.deepEqual(storage.search({ status: 'none' }).map((e) => e.sampleId), ['B'])
  assert.deepEqual(storage.search({ q: 'A', status: 'ok' }).map((e) => e.sampleId), ['A'])
})

test('markDirty macht ein Ergebnis veraltet, statt es zu löschen', () => {
  const plot = plotOf('P-1', { evaluation: { at: 'x', request: {}, response: { result: 'R1A' }, status: 'ok' } })
  const dirty = markDirty(plot)
  assert.equal(dirty.evaluation.status, 'stale')
  assert.equal(dirty.evaluation.response.result, 'R1A')
})

test('markDirty lässt Fehler und fehlende Auswertungen in Ruhe', () => {
  assert.equal(markDirty(plotOf('P-1')).evaluation, null)
  const err = plotOf('P-1', { evaluation: { at: 'x', request: {}, response: null, status: 'error' } })
  assert.equal(markDirty(err).evaluation.status, 'error')
})

test('nextSampleId zählt am selben Tag hoch', () => {
  const { storage } = setup(['2026-09-14T10:00:00.000Z'])
  assert.equal(storage.nextSampleId(), 'P-2026-09-14-1')
  storage.save(plotOf('P-2026-09-14-1'))
  assert.equal(storage.nextSampleId(), 'P-2026-09-14-2')
})

test('ein beschädigter Index kippt die App nicht', () => {
  const { backend, storage } = setup()
  backend.setItem('expertus.index', '{kaputt')
  assert.deepEqual(storage.list(), [])
})
