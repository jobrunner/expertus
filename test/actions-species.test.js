// Artenliste, Deckung, Skalenwechsel und evaluate() — alles, was von der
// Artenliste bis zur habitatus-Auswertung reicht. Aufgeteilt aus dem
// früheren actions.test.js (siehe .codecharta-ratchet.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ServiceError } from '../src/adapters/errors.js'
import { setup } from './helpers/actions-fixtures.js'

test('blockingReason verlangt mindestens eine Art', async () => {
  const { actions } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  assert.match(actions.blockingReason(), /Art/)
})

test('blockingReason schweigt, wenn alles bereit ist', async () => {
  const { actions } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  assert.equal(actions.blockingReason(), null)
})

test('setCover rechnet eine Klasse in Prozent um und behält beides', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  assert.equal(store.get().plot.species[0].cover, 37.5)
  assert.equal(store.get().plot.species[0].coverClass, '3')
})

test('eine Deckung in Prozent verliert das Klassenetikett, wenn keine Klasse passt', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { percent: 24.65 })
  assert.equal(store.get().plot.species[0].cover, 24.65)
  assert.equal(store.get().plot.species[0].coverClass, null)
})

test('ein Skalenwechsel lässt die Prozentwerte unangetastet', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '2' })
  actions.setScale('bb-extended')
  assert.equal(store.get().plot.species[0].cover, 15)
  // 15 % gibt es in der erweiterten Skala nicht: das Etikett fällt weg,
  // gerundet wird nichts.
  assert.equal(store.get().plot.species[0].coverClass, null)
})

test('evaluate schreibt Ergebnis und Request an den Plot und speichert ihn', async () => {
  const { actions, store, storage } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  await actions.evaluate()
  const plot = store.get().plot
  assert.equal(plot.evaluation.status, 'ok')
  assert.equal(plot.evaluation.response.result, 'R1A')
  assert.equal(storage.load(plot.sampleId).evaluation.status, 'ok')
})

test('eine Änderung nach der Auswertung macht das Ergebnis veraltet', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  await actions.evaluate()
  actions.addSpecies({ name: 'Nardus stricta', entry: 'manual' })
  assert.equal(store.get().plot.evaluation.status, 'stale')
  assert.equal(store.get().plot.evaluation.response.result, 'R1A')
})

test('evaluate ohne vollständige Kopfdaten ruft den Dienst gar nicht', async () => {
  let gerufen = false
  const habitatus = { classify: async () => ((gerufen = true), {}) }
  const { actions, store } = setup({ habitatus })
  actions.newPlot()
  await actions.evaluate()
  assert.equal(gerufen, false)
  assert.match(store.get().error.message, /Country/)
})

test('ein 400 von habitatus landet wörtlich im Store und als Fehlerstatus am Plot', async () => {
  const habitatus = {
    classify: async () => { throw new ServiceError('unknown country "Deutschland"', { kind: 'request', service: 'habitatus', status: 400 }) },
  }
  const { actions, store } = setup({ habitatus })
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  await actions.evaluate()
  assert.equal(store.get().error.message, 'unknown country "Deutschland"')
  assert.equal(store.get().plot.evaluation.status, 'error')
  assert.equal(store.get().evaluating, false)
})

test('die Leeroption der Klassenauswahl setzt die Deckung auf null zurück', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  actions.setCover(0, { classCode: '' })
  assert.equal(store.get().plot.species[0].cover, null)
  assert.equal(store.get().plot.species[0].coverClass, null)
})
