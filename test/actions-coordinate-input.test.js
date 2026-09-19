// setCoordinateInput() für die sieben Koordinatensysteme aus Aufgabe 12:
// bei WGS 84 verhält sie sich wie das altbekannte setCoordinate(), bei
// jedem anderen System bleibt die Gradkoordinate bis zur ortus-Antwort
// unbekannt. Aufgeteilt aus dem früheren actions.test.js (siehe
// .codecharta-ratchet.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, HEADER, ORIGIN } from './helpers/actions-fixtures.js'

test('setCoordinateInput mit System 4326 setzt die Koordinate wie setCoordinate', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinateInput({ system: '4326', x: '13.405', y: '52.52', text: '', source: 'manual' })
  assert.deepEqual(store.get().plot.coordinate, { lat: 52.52, lon: 13.405 })
  assert.deepEqual(store.get().plot.coordInput, { system: '4326', x: 13.405, y: 52.52, text: '' })
})

test('setCoordinateInput mit einem projizierten System kennt die Gradkoordinate noch nicht', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinateInput({ system: '25832', x: '389524', y: '5820270', text: '', source: 'manual' })
  // Nur ortus kann Rechts-/Hochwert in Grad umrechnen — eine geratene
  // Umrechnung wäre schlimmer als ein kurzes "unbekannt".
  assert.equal(store.get().plot.coordinate, null)
  assert.deepEqual(store.get().plot.coordInput, { system: '25832', x: 389524, y: 5820270, text: '' })
  assert.equal(store.get().plot.headerOrigin.Country, 'missing')
})

test('fetchHeader trägt bei einem projizierten System die von ortus reprojizierte Koordinate nach', async () => {
  const ortus = {
    lookup: async ({ system, x, y }) => {
      assert.equal(system, '25832')
      assert.equal(x, 389524)
      assert.equal(y, 5820270)
      return { header: HEADER, origin: ORIGIN, evidence: {}, coordinate: { lat: 52.52, lon: 13.405 } }
    },
  }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinateInput({ system: '25832', x: '389524', y: '5820270', text: '', source: 'manual' })
  assert.equal(store.get().plot.coordinate, null)
  await actions.fetchHeader()
  assert.deepEqual(store.get().plot.coordinate, { lat: 52.52, lon: 13.405 })
})

test('setCoordinateInput mit System mgrs speichert den Text, nicht x/y', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinateInput({ system: 'mgrs', x: '', y: '', text: '33UUU9449865648', source: 'manual' })
  assert.equal(store.get().plot.coordinate, null)
  assert.deepEqual(store.get().plot.coordInput, { system: 'mgrs', x: null, y: null, text: '33UUU9449865648' })
})

test('setCoordinateInput ohne gültige Werte verändert den Plot nicht', () => {
  const { actions, store } = setup()
  actions.newPlot()
  const vorher = store.get().plot
  actions.setCoordinateInput({ system: '25832', x: '', y: '', text: '', source: 'manual' })
  assert.equal(store.get().plot, vorher)
  actions.setCoordinateInput({ system: 'mgrs', x: '', y: '', text: '   ', source: 'manual' })
  assert.equal(store.get().plot, vorher)
})
