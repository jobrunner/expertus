// setCoordinate(), fetchHeader() und ihr Zusammenspiel: Abbruch einer
// laufenden Abfrage durch eine neue, Fehlerbehandlung, und was bei einem
// Koordinatenwechsel mit den alten Kopfdaten passiert. Aufgeteilt aus dem
// früheren actions.test.js (siehe .codecharta-ratchet.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ServiceError } from '../src/adapters/errors.js'
import { setup, HEADER, ORIGIN } from './helpers/actions-fixtures.js'

test('fetchHeader schreibt Kopfdaten und Herkunft in den Plot', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  assert.equal(store.get().plot.header.Country, 'Germany')
  assert.equal(store.get().plot.headerOrigin.Country, 'ortus')
  assert.equal(store.get().headerPending, false)
})

test('während des Abrufs steht headerPending, und die Artenliste bleibt bedienbar', async () => {
  let freigeben
  const ortus = { lookup: () => new Promise((res) => (freigeben = () => res({ header: HEADER, origin: ORIGIN, evidence: {} }))) }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  const laeuft = actions.fetchHeader()
  assert.equal(store.get().headerPending, true)
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  assert.equal(store.get().plot.species.length, 1)
  freigeben()
  await laeuft
  assert.equal(store.get().plot.species.length, 1)
})

test('eine zweite Abfrage bricht die erste ab', async () => {
  const signale = []
  const ortus = {
    lookup: async ({ signal }) => (signale.push(signal), { header: HEADER, origin: ORIGIN, evidence: {} }),
  }
  const { actions } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  const erste = actions.fetchHeader()
  const zweite = actions.fetchHeader()
  await Promise.all([erste, zweite])
  assert.equal(signale[0].aborted, true)
  assert.equal(signale[1].aborted, false)
})

test('ein Fehler bei den Kopfdaten landet im Store und lässt den Plot stehen', async () => {
  const ortus = { lookup: async () => { throw new ServiceError('down', { kind: 'service', service: 'ortus' }) } }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  await actions.fetchHeader()
  assert.match(store.get().error.message, /down/)
  assert.equal(store.get().headerPending, false)
  assert.ok(store.get().plot)
})

test('ein Abbruch erzeugt keine Fehlermeldung', async () => {
  const ortus = { lookup: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  await actions.fetchHeader()
  assert.equal(store.get().error, null)
})

test('ein während des Abrufs von Hand gesetztes Feld überlebt die eintreffende Antwort', async () => {
  let freigeben
  const ortus = { lookup: () => new Promise((res) => (freigeben = () => res({ header: HEADER, origin: ORIGIN, evidence: {} }))) }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  const laeuft = actions.fetchHeader()
  actions.setHeaderField('Coast_EEA', 'BAL_COAST')
  freigeben()
  await laeuft
  assert.equal(store.get().plot.header.Coast_EEA, 'BAL_COAST')
  assert.equal(store.get().plot.headerOrigin.Coast_EEA, 'manual')
})

test('während des Abrufs von Hand unberührte Felder übernehmen die Antwort', async () => {
  let freigeben
  const ortus = { lookup: () => new Promise((res) => (freigeben = () => res({ header: HEADER, origin: ORIGIN, evidence: {} }))) }
  const { actions, store } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 1, lon: 1, source: 'manual' })
  const laeuft = actions.fetchHeader()
  actions.setHeaderField('Coast_EEA', 'BAL_COAST')
  freigeben()
  await laeuft
  assert.equal(store.get().plot.header.Country, HEADER.Country)
  assert.equal(store.get().plot.headerOrigin.Country, 'ortus')
})

test('ein Koordinatenwechsel setzt die aus ortus stammenden Kopfdaten zurück', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.setHeaderField('Coast_EEA', 'BAL_COAST')
  // Tel Aviv statt Berlin: die Kopfdaten des alten Punktes dürfen nicht
  // stehen bleiben und still mitausgewertet werden.
  actions.setCoordinate({ lat: 32.08, lon: 34.78, source: 'manual' })
  const plot = store.get().plot
  assert.equal(plot.headerOrigin.Country, 'missing')
  assert.equal(plot.header.Country, null)
  assert.equal(plot.headerOrigin.Ecoreg, 'missing')
  assert.deepEqual(plot.headerEvidence, {})
  // Ein von Hand gesetztes Feld bleibt unangetastet.
  assert.equal(plot.headerOrigin.Coast_EEA, 'manual')
  assert.equal(plot.header.Coast_EEA, 'BAL_COAST')
  assert.match(actions.blockingReason(), /Country/)
})

test('während des Kopfdaten-Abrufs blockiert blockingReason, auch wenn sonst alles bereit ist', async () => {
  let freigeben
  const ortus = { lookup: () => new Promise((res) => (freigeben = () => res({ header: HEADER, origin: ORIGIN, evidence: {} }))) }
  const { actions } = setup({ ortus })
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  const erster = actions.fetchHeader()
  freigeben()
  await erster
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  assert.equal(actions.blockingReason(), null)
  // Zweiter Abruf: solange er läuft, gehören die angezeigten Kopfdaten noch
  // nicht sicher zur aktuellen Koordinate.
  const zweiter = actions.fetchHeader()
  assert.match(actions.blockingReason(), /Kopfdaten werden noch geholt/)
  freigeben()
  await zweiter
  assert.equal(actions.blockingReason(), null)
})
