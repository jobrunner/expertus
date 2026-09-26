// setHeaderField() und die Fälle von blockingReason(), die an einzelnen
// Kopfdatenfeldern hängen. Aufgeteilt aus dem früheren actions.test.js
// (siehe .codecharta-ratchet.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers/actions-fixtures.js'

test('ein von Hand gesetztes Feld wechselt die Herkunft auf manual', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.setHeaderField('Coast_EEA', 'BAL_COAST')
  assert.equal(store.get().plot.header.Coast_EEA, 'BAL_COAST')
  assert.equal(store.get().plot.headerOrigin.Coast_EEA, 'manual')
})

test('blockingReason benennt das fehlende Feld', () => {
  const { actions } = setup()
  actions.newPlot()
  assert.match(actions.blockingReason(), /Land/)
})

test('ein geleertes Kopfdatenfeld gilt als fehlend, nicht als von Hand gesetzte Null', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.setHeaderField('Ecoreg', null)
  assert.equal(store.get().plot.header.Ecoreg, null)
  assert.equal(store.get().plot.headerOrigin.Ecoreg, 'missing')
  assert.match(actions.blockingReason(), /Ökoregion/)
})

test('die TDWG-Region kommt mit den Kopfdaten in den Plot', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  assert.equal(store.get().plot.tdwgRegion, null)
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  // Ohne sie sucht die Artenliste ohne Gebietsbezug, und hostus meldet zu
  // jedem Treffer in_area=false.
  assert.equal(store.get().plot.tdwgRegion, 'GER')
})

test('eine neue Koordinate verwirft die Region wie die abgeleiteten Kopfdaten', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  assert.equal(store.get().plot.tdwgRegion, 'GER')
  actions.setCoordinate({ lat: 40.0, lon: -3.0, source: 'manual' })
  // Die alte Region gehört zur alten Koordinate; stehen zu bleiben hieße,
  // Vorschläge für das falsche Gebiet zu gewichten.
  assert.equal(store.get().plot.tdwgRegion, null)
})
