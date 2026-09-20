// Aktionen rund um den Plot selbst: anlegen, umbenennen, und was passiert,
// wenn das Schreiben in den lokalen Speicher fehlschlägt. Aufgeteilt aus
// dem früheren actions.test.js (siehe .codecharta-ratchet.json): eine
// Datei je Aktionsgruppe hält die Testfälle überschaubar und lässt jede
// Datei unter der Komplexitätsschranke bleiben, ohne dass sich an den
// Fällen selbst etwas ändert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createActions } from '../src/actions.js'
import { createStore } from '../src/store.js'
import { createStorage } from '../src/storage.js'
import { createMemoryStorage } from './helpers/memory-storage.js'
import { setup, HEADER, ORIGIN } from './helpers/actions-fixtures.js'

test('ein neuer Plot bekommt eine Sample-ID und leere Kopfdaten', () => {
  const { actions, store } = setup()
  const plot = actions.newPlot()
  assert.equal(plot.sampleId, 'P-2026-09-14-1')
  assert.deepEqual(plot.species, [])
  assert.equal(plot.scale, 'bb-classic')
  assert.equal(store.get().plot.sampleId, plot.sampleId)
})

test('rename verschiebt den Plot und lässt die Route folgen', () => {
  const { actions, store, storage } = setup()
  actions.newPlot()
  actions.rename('Sylt-03')
  assert.equal(store.get().plot.sampleId, 'Sylt-03')
  assert.equal(storage.load('Sylt-03').sampleId, 'Sylt-03')
})

test('rename auf eine belegte ID meldet den Konflikt, ohne zu überschreiben', () => {
  const { actions, store, storage } = setup()
  actions.newPlot()
  actions.rename('A')
  actions.newPlot()
  actions.rename('B')
  actions.rename('A')
  assert.match(store.get().error.message, /bereits vergeben/)
  assert.equal(storage.load('B').sampleId, 'B')
})

test('ein fehlgeschlagener Schreibvorgang landet als Fehler im Zustand, statt durchzuschlagen', () => {
  const backend = createMemoryStorage()
  let voll = false
  const original = backend.setItem.bind(backend)
  backend.setItem = (k, v) => {
    if (voll) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' })
    original(k, v)
  }
  const store = createStore({ plot: null, headerPending: false, evaluating: false, error: null })
  const storage = createStorage({ backend, now: () => '2026-09-14T10:00:00.000Z' })
  const actions = createActions({
    store, storage,
    ortus: { lookup: async () => ({ header: HEADER, origin: ORIGIN, evidence: {} }) },
    habitatus: { classify: async () => ({}) },
    now: () => '2026-09-14T10:00:00.000Z',
  })
  actions.newPlot()
  voll = true
  assert.doesNotThrow(() => actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' }))
  assert.match(store.get().error.message, /lokale Speicher/)
  assert.equal(store.get().plot.species.length, 0)
  // Auch das allererste Speichern eines Plots darf nicht lautlos scheitern.
  store.set({ error: null })
  assert.doesNotThrow(() => assert.equal(actions.newPlot(), null))
  assert.match(store.get().error.message, /lokale Speicher/)
})
