// fetchHabitat(): das Nachschlagewerk zu einem erkannten Habitattyp.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers/actions-fixtures.js'

const R55 = {
  code: 'R55', name: 'Lowland moist or wet tall-herb and fern fringe',
  beschreibung: 'Tall-herb …', quelle: 'floraveg:…',
  syntaxa: [{ id: 'CM05E', rang: 'alliance', name: 'Conioselinion tatarici', autor: 'Golub et al. 2003' }],
  arten: { diagnostic: [{ name: 'Urtica dioica', fidelity: 16 }], constant: [], dominant: [] },
}

function situsStub(antwort, zaehler = { n: 0 }) {
  return { habitatType: async () => { zaehler.n += 1; return antwort } }
}

test('der Habitattyp landet im Zustand, nicht im Plot', async () => {
  const { actions, store, storage } = setup({ situs: situsStub(R55) })
  actions.newPlot()
  await actions.fetchHabitat('R55')
  assert.equal(store.get().habitat.code, 'R55')
  assert.equal(store.get().habitat.data.name, R55.name)
  // Nachschlagedaten gehören nicht in die Ablage: dort lägen sie als Kopie,
  // die veraltet, sobald situs seine Artefakte erneuert.
  assert.equal('habitat' in storage.load(store.get().plot.sampleId), false)
})

test('derselbe Code wird nicht zweimal geholt', async () => {
  const zaehler = { n: 0 }
  const { actions } = setup({ situs: situsStub(R55, zaehler) })
  await actions.fetchHabitat('R55')
  await actions.fetchHabitat('R55')
  assert.equal(zaehler.n, 1)
})

test('ein anderer Code wird geholt', async () => {
  const zaehler = { n: 0 }
  const { actions, store } = setup({ situs: situsStub(R55, zaehler) })
  await actions.fetchHabitat('R55')
  await actions.fetchHabitat('N15')
  assert.equal(zaehler.n, 2)
  assert.equal(store.get().habitat.code, 'N15')
})

test('ohne Code wird gar nicht gefragt', async () => {
  const zaehler = { n: 0 }
  const { actions, store } = setup({ situs: situsStub(R55, zaehler) })
  await actions.fetchHabitat(null)
  assert.equal(zaehler.n, 0)
  assert.equal(store.get().habitat, null)
})

test('ein unbekannter Typ ist kein Fehler, nur eine leere Auskunft', async () => {
  const { actions, store } = setup({ situs: situsStub(null) })
  await actions.fetchHabitat('ZZ99')
  const h = store.get().habitat
  assert.equal(h.data, null)
  assert.equal(h.error, null)
  assert.equal(h.pending, false)
})

test('ein Ausfall von situs überzieht die Maske nicht mit einer Meldung', async () => {
  const { actions, store } = setup({
    situs: { habitatType: async () => { throw new Error('situs weg') } },
  })
  actions.newPlot()
  await actions.fetchHabitat('R55')
  assert.match(store.get().habitat.error.message, /situs weg/)
  // Der allgemeine Fehlerkanal bleibt frei: das Ergebnis der Auswertung
  // steht unabhängig vom Nachschlagewerk.
  assert.equal(store.get().error, null)
})

test('nach einem Fehler wird NICHT von selbst erneut versucht', async () => {
  // Der Abruf wird beim Zeichnen angestoßen, und das Setzen des Fehlers
  // zeichnet neu. Ein selbsttätiger Neuversuch ergäbe daraus eine Schleife,
  // die einen ohnehin angeschlagenen Dienst mit Anfragen überzieht.
  const zaehler = { n: 0 }
  const { actions, store } = setup({
    situs: { habitatType: async () => { zaehler.n += 1; throw new Error('kurz weg') } },
  })
  await actions.fetchHabitat('R55')
  await actions.fetchHabitat('R55')
  await actions.fetchHabitat('R55')
  assert.equal(zaehler.n, 1)
  assert.ok(store.get().habitat.error)
})

test('auf Zuruf wird erneut versucht', async () => {
  let erster = true
  const zaehler = { n: 0 }
  const { actions, store } = setup({
    situs: { habitatType: async () => { zaehler.n += 1; if (erster) { erster = false; throw new Error('kurz weg') } return R55 } },
  })
  await actions.fetchHabitat('R55')
  assert.ok(store.get().habitat.error)
  // Der Knopf in der Ansicht übergibt erneut: true.
  await actions.fetchHabitat('R55', { erneut: true })
  assert.equal(zaehler.n, 2)
  assert.equal(store.get().habitat.data.name, R55.name)
})
