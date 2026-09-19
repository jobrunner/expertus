import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createActions } from '../src/actions.js'
import { createStore } from '../src/store.js'
import { createStorage } from '../src/storage.js'
import { createMemoryStorage } from './helpers/memory-storage.js'
import { ServiceError } from '../src/adapters/errors.js'

const HEADER = {
  Country: 'Germany', Coast_EEA: 'N_COAST', Dunes_Bohn: 'N_DUNES',
  Ecoreg: 654, 'Altitude (m)': 36, DEG_LAT: 52.52, DEG_LON: 13.405,
}
const ORIGIN = Object.fromEntries(Object.keys(HEADER).map((k) => [k, 'ortus']))

function setup({ ortus, habitatus } = {}) {
  const store = createStore({ plot: null, headerPending: false, evaluating: false, error: null })
  const storage = createStorage({ backend: createMemoryStorage(), now: () => '2026-09-14T10:00:00.000Z' })
  const actions = createActions({
    store,
    storage,
    ortus: ortus ?? { lookup: async () => ({ header: HEADER, origin: ORIGIN, evidence: {} }) },
    habitatus: habitatus ?? { classify: async () => ({ result: 'R1A', matches: [], resolution: [], versions: {}, truncatedAt10: false, request: {} }) },
    now: () => '2026-09-14T10:00:00.000Z',
  })
  return { store, storage, actions }
}

test('ein neuer Plot bekommt eine Sample-ID und leere Kopfdaten', () => {
  const { actions, store } = setup()
  const plot = actions.newPlot()
  assert.equal(plot.sampleId, 'P-2026-09-14-1')
  assert.deepEqual(plot.species, [])
  assert.equal(plot.scale, 'bb-classic')
  assert.equal(store.get().plot.sampleId, plot.sampleId)
})

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

test('ein von Hand gesetztes Feld wechselt die Herkunft auf manual', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.setHeaderField('Coast_EEA', 'BAL_COAST')
  assert.equal(store.get().plot.header.Coast_EEA, 'BAL_COAST')
  assert.equal(store.get().plot.headerOrigin.Coast_EEA, 'manual')
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

test('blockingReason benennt das fehlende Feld', () => {
  const { actions } = setup()
  actions.newPlot()
  assert.match(actions.blockingReason(), /Country/)
})

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

test('die Leeroption der Klassenauswahl setzt die Deckung auf null zurück', () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.addSpecies({ name: 'Festuca ovina', entry: 'manual' })
  actions.setCover(0, { classCode: '3' })
  actions.setCover(0, { classCode: '' })
  assert.equal(store.get().plot.species[0].cover, null)
  assert.equal(store.get().plot.species[0].coverClass, null)
})

test('ein geleertes Kopfdatenfeld gilt als fehlend, nicht als von Hand gesetzte Null', async () => {
  const { actions, store } = setup()
  actions.newPlot()
  actions.setCoordinate({ lat: 52.52, lon: 13.405, source: 'manual' })
  await actions.fetchHeader()
  actions.setHeaderField('Ecoreg', null)
  assert.equal(store.get().plot.header.Ecoreg, null)
  assert.equal(store.get().plot.headerOrigin.Ecoreg, 'missing')
  assert.match(actions.blockingReason(), /Ecoreg/)
})

// Aufgabe 12: die Koordinateneingabe kann in jedem der sieben Systeme
// erfolgen. setCoordinateInput() ist die Schnittstelle dafür — bei WGS 84
// verhält sie sich wie das altbekannte setCoordinate(), bei jedem anderen
// System bleibt die Gradkoordinate bis zur ortus-Antwort unbekannt.
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
