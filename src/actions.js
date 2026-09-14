// Orchestrierung. Die einzige Stelle, die mehrere Adapter kennt; Ansichten
// rufen Aktionen, nie Adapter.
import { HEADER_FIELDS, missingFields } from './header-map.js'
import { markDirty, CollisionError } from './storage.js'
import { classFor, isValidPercent, toPercent } from './cover.js'

export function createActions({ store, storage, ortus, habitatus, now = () => new Date().toISOString() }) {
  let headerAbort = null

  const plot = () => store.get().plot

  // Jede Änderung am Plot geht hier durch: speichern, veralten lassen,
  // Index auffrischen. Verteilt man das auf die einzelnen Aktionen, wird
  // irgendwann eine vergessen, und dann steht ein Ergebnis neben einer
  // Artenliste, die es nicht erzeugt hat.
  function update(mutate, { dirty = true } = {}) {
    const current = plot()
    if (!current) return null
    const next = mutate({ ...current })
    const marked = dirty ? markDirty(next) : next
    const saved = storage.save(marked)
    store.set({ plot: saved, index: storage.list() })
    return saved
  }

  function emptyHeader() {
    return Object.fromEntries(HEADER_FIELDS.map((f) => [f, null]))
  }

  function emptyOrigin() {
    return Object.fromEntries(HEADER_FIELDS.map((f) => [f, 'missing']))
  }

  return {
    newPlot() {
      const fresh = {
        sampleId: storage.nextSampleId(),
        coordinate: null,
        coordSource: null,
        accuracyM: null,
        header: emptyHeader(),
        headerOrigin: emptyOrigin(),
        headerEvidence: {},
        scale: 'bb-classic',
        species: [],
        evaluation: null,
      }
      const saved = storage.save(fresh)
      store.set({ plot: saved, error: null, index: storage.list() })
      return saved
    },

    openPlot(sampleId) {
      const found = storage.load(sampleId)
      store.set({ plot: found, error: null })
      return found
    },

    setCoordinate({ lat, lon, source, accuracyM = null }) {
      return update((p) => ({ ...p, coordinate: { lat, lon }, coordSource: source, accuracyM }))
    },

    async fetchHeader() {
      const current = plot()
      if (!current?.coordinate) return
      // Eine zweite Abfrage bricht die erste ab; das ist der Normalfall
      // beim Nachtippen einer Koordinate, kein Fehler.
      headerAbort?.abort()
      headerAbort = new AbortController()
      const signal = headerAbort.signal
      store.set({ headerPending: true, error: null })
      try {
        const { header, origin, evidence } = await ortus.lookup({ ...current.coordinate, signal })
        // Den Plot-Stand erst NACH dem Abruf lesen: zwischen Start und
        // Eintreffen der Antwort kann der Nutzer Felder von Hand gesetzt
        // haben. Ein von Hand korrigierter Wert bleibt Vorrang vor der
        // später eintreffenden ortus-Antwort — sonst würde eine bewusste
        // Korrektur des Nutzers kommentarlos wieder überschrieben.
        update((p) => {
          const mergedHeader = { ...p.header }
          const mergedOrigin = { ...p.headerOrigin }
          for (const field of Object.keys(header)) {
            if (p.headerOrigin?.[field] === 'manual') continue
            mergedHeader[field] = header[field]
            mergedOrigin[field] = origin[field]
          }
          return { ...p, header: mergedHeader, headerOrigin: mergedOrigin, headerEvidence: evidence }
        })
        store.set({ headerPending: false })
      } catch (err) {
        // Ein Abbruch ist kein Fehler, sondern der Normalfall beim
        // Nachtippen einer Koordinate.
        if (err?.name === 'AbortError') {
          store.set({ headerPending: false })
          return
        }
        store.set({ headerPending: false, error: err })
      }
    },

    setHeaderField(field, value) {
      return update((p) => ({
        ...p,
        header: { ...p.header, [field]: value },
        headerOrigin: { ...p.headerOrigin, [field]: 'manual' },
      }))
    },

    addSpecies({ name, conceptId = null, entry = 'manual' }) {
      return update((p) => ({
        ...p,
        species: [...p.species, { name, conceptId, cover: null, coverClass: null, entry }],
      }))
    },

    removeSpecies(index) {
      return update((p) => ({ ...p, species: p.species.filter((_, i) => i !== index) }))
    },

    setCover(index, { percent, classCode }) {
      return update((p) => {
        const scale = p.scale
        const value = classCode !== undefined ? toPercent(scale, classCode) : percent
        const species = p.species.map((s, i) =>
          i === index ? { ...s, cover: value, coverClass: classFor(scale, value) } : s,
        )
        return { ...p, species }
      })
    },

    // Der Prozentwert ist die Wahrheit; der Umschalter wechselt nur das
    // Eingabewerkzeug. Existiert die Klasse in der neuen Skala nicht, fällt
    // das Etikett weg — gerundet wird nicht, das würde eine nie gemachte
    // Messung erfinden.
    setScale(scale) {
      return update((p) => ({
        ...p,
        scale,
        species: p.species.map((s) => ({ ...s, coverClass: s.cover === null ? null : classFor(scale, s.cover) })),
      }))
    },

    // Umbenennen ändert die Auswertungsgrundlage nicht: das Ergebnis passt
    // weiterhin zur selben Artenliste. storage.rename kapselt Speichern und
    // Index bereits; markDirty wäre hier sachlich falsch und würde eine
    // gültige Auswertung durch bloßes Umbenennen entwerten.
    rename(newId) {
      try {
        const moved = storage.rename(plot().sampleId, newId)
        store.set({ plot: moved, error: null, index: storage.list() })
        return moved
      } catch (err) {
        if (err instanceof CollisionError) {
          store.set({ error: err })
          return null
        }
        throw err
      }
    },

    blockingReason() {
      const current = plot()
      if (!current) return 'Kein Plot geöffnet.'
      const fehlend = missingFields(current.headerOrigin ?? emptyOrigin())
      if (fehlend.length) return `Kopfdaten fehlen: ${fehlend.join(', ')}`
      if (!current.species.length) return 'Mindestens eine Art wird gebraucht.'
      const ohneDeckung = current.species.filter((s) => !isValidPercent(s.cover))
      if (ohneDeckung.length) return `Ohne Deckung: ${ohneDeckung.map((s) => s.name).join(', ')}`
      return null
    },

    async evaluate() {
      const reason = this.blockingReason()
      if (reason) {
        store.set({ error: new Error(reason) })
        return
      }
      const current = plot()
      store.set({ evaluating: true, error: null })
      try {
        const response = await habitatus.classify({
          header: current.header,
          species: current.species,
          sampleId: current.sampleId,
        })
        // Die Auswertung schreibt kein 'stale': sie setzt das Ergebnis
        // frisch (dirty: false); erst eine nachfolgende Änderung über
        // update() macht es über markDirty() veraltet.
        update(
          (p) => ({ ...p, evaluation: { at: now(), request: response.request, response, status: 'ok' } }),
          { dirty: false },
        )
        store.set({ evaluating: false })
      } catch (err) {
        if (err?.name === 'AbortError') {
          store.set({ evaluating: false })
          return
        }
        // Ein Fehler lässt den Plot stehen: er bleibt gespeichert und
        // bearbeitbar, die Fehlermeldung des Dienstes wird unverändert
        // übernommen.
        update(
          (p) => ({
            ...p,
            evaluation: { at: now(), request: null, response: null, status: 'error', message: err.message },
          }),
          { dirty: false },
        )
        store.set({ evaluating: false, error: err })
      }
    },
  }
}
