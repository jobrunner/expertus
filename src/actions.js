// Orchestrierung. Die einzige Stelle, die mehrere Adapter kennt; Ansichten
// rufen Aktionen, nie Adapter.
import { HEADER_FIELDS, missingFields } from './header-map.js'
import { markDirty, CollisionError, StorageFullError } from './storage.js'
import { classFor, isValidPercent, toPercent } from './cover.js'

export function createActions({ store, storage, ortus, habitatus, now = () => new Date().toISOString() }) {
  let headerAbort = null

  const plot = () => store.get().plot

  // Jede Änderung am Plot geht hier durch: speichern, veralten lassen,
  // Index auffrischen. Verteilt man das auf die einzelnen Aktionen, wird
  // irgendwann eine vergessen, und dann steht ein Ergebnis neben einer
  // Artenliste, die es nicht erzeugt hat.
  // `extra` fährt weitere Store-Felder im selben store.set() mit (z. B.
  // headerPending: false). Zwei store.set() direkt hintereinander lösen
  // zwei Neuaufbauten des Einhängepunkts aus, bevor preserveFocus den
  // ersten überhaupt wiederherstellen konnte — ein Feld, in das die
  // Nutzerin gerade tippt (etwa die Art-Suche, die keinen eigenen
  // Store-Platz hat), verlöre dabei seinen Inhalt. Eine Zustandsänderung,
  // ein Aufbau.
  function update(mutate, { dirty = true, extra = {} } = {}) {
    const current = plot()
    if (!current) return null
    const next = mutate({ ...current })
    const marked = dirty ? markDirty(next) : next
    // Ein Schreibfehler darf nicht als unbehandelter Fehler in der Konsole
    // enden: der Browser ist die einzige Kopie, und der Nutzer erfasst im
    // Gelände sonst ahnungslos weiter. Er wird deshalb in den Zustand
    // gesetzt, wo die Maske ihn sichtbar und mit Alarmrolle anzeigt.
    let saved
    try {
      saved = storage.save(marked)
    } catch (err) {
      if (!(err instanceof StorageFullError)) throw err
      store.set({ error: err, ...extra })
      return null
    }
    store.set({ plot: saved, index: storage.list(), ...extra })
    return saved
  }

  // Ein neuer Koordinatenpunkt macht jedes aus ortus stammende Kopfdatum
  // ungültig (siehe die Begründung bei setCoordinate); von Hand gesetzte
  // Felder bleiben stehen. Von setCoordinate() UND setCoordinateInput()
  // gebraucht, deshalb hier gemeinsam.
  function headerFuerNeueKoordinate(p) {
    const header = { ...p.header }
    const origin = { ...p.headerOrigin }
    for (const field of HEADER_FIELDS) {
      if (origin[field] === 'manual') continue
      header[field] = null
      origin[field] = 'missing'
    }
    return { header, origin }
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
        coordInput: null,
        coordSource: null,
        accuracyM: null,
        header: emptyHeader(),
        headerOrigin: emptyOrigin(),
        headerEvidence: {},
        scale: 'bb-classic',
        species: [],
        evaluation: null,
      }
      // Wie in update(): schlägt das erste Speichern fehl, entsteht gar
      // kein Plot — das muss sichtbar werden, nicht bloß in der Konsole
      // stehen.
      let saved
      try {
        saved = storage.save(fresh)
      } catch (err) {
        if (!(err instanceof StorageFullError)) throw err
        store.set({ error: err })
        return null
      }
      store.set({ plot: saved, error: null, index: storage.list() })
      return saved
    },

    openPlot(sampleId) {
      const found = storage.load(sampleId)
      store.set({ plot: found, error: null })
      return found
    },

    // Kopfdaten gehören zu genau einer Koordinate. Bleiben sie bei einem
    // Koordinatenwechsel stehen, werden die Werte des ALTEN Punktes
    // mitausgewertet — habitatus zwingt Unauflösbares intern auf null und
    // wertet zweiwertig aus, ein falsches Kopfdatum erzeugt dort also kein
    // "unbekannt", sondern still ein falsches Habitat. Deshalb fällt jedes
    // aus ortus stammende Feld auf 'missing' zurück; es blockiert damit die
    // Auswertung, bis die Antwort zum neuen Punkt da ist. Von Hand gesetzte
    // Felder bleiben stehen — konsistent damit, dass eine manuelle
    // Übersteuerung auch eine eintreffende ortus-Antwort überlebt. Die
    // Belege gehören zum alten Punkt und werden verworfen.
    // lat/lon sind hier immer WGS-84-Grad: der GPS-Knopf liefert nichts
    // anderes, und wer die Koordinateneingabe im System WGS 84 benutzt,
    // gibt ohnehin schon Grad ein. Für die übrigen sechs Systeme (Aufgabe
    // 12) ist die Gradkoordinate NICHT bekannt, ohne ortus zu fragen — dafür
    // gibt es setCoordinateInput().
    setCoordinate({ lat, lon, source, accuracyM = null }) {
      return update((p) => {
        const { header, origin } = headerFuerNeueKoordinate(p)
        return {
          ...p,
          coordinate: { lat, lon },
          coordInput: { system: '4326', x: lon, y: lat, text: '' },
          coordSource: source,
          accuracyM,
          header,
          headerOrigin: origin,
          headerEvidence: {},
        }
      })
    },

    // Eingabe aus der Bedienform des Design-Systems (Aufgabe 12): system ist
    // die EPSG-Kennung oder 'mgrs', x/y bzw. text die eingegebenen Rohwerte
    // in genau dieser Zuordnung (x=Lon/Rechtswert, y=Lat/Hochwert — die
    // Bedienform tauscht nur die SICHTBARE Reihenfolge, nie die Bedeutung).
    // Bei WGS 84 ist die Gradkoordinate der Rohwert selbst und wird wie
    // bisher sofort übernommen. Bei jedem anderen System kennt nur ortus die
    // Umrechnung — die Koordinate bleibt bis zur Antwort auf fetchHeader()
    // unbekannt, genau wie bei einem frisch angelegten Plot ohne Koordinate.
    // Eine geratene Umrechnung wäre hier schlimmer als ein kurzes "unbekannt":
    // sie setzte einen Fundort stillschweigend an die falsche Stelle.
    setCoordinateInput({ system, x, y, text, source, accuracyM = null }) {
      if (system === '4326') {
        const lon = Number.parseFloat(String(x).replace(',', '.'))
        const lat = Number.parseFloat(String(y).replace(',', '.'))
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        return this.setCoordinate({ lat, lon, source, accuracyM })
      }
      if (system === 'mgrs') {
        const wert = String(text ?? '').trim()
        if (!wert) return null
        return update((p) => {
          const { header, origin } = headerFuerNeueKoordinate(p)
          return {
            ...p,
            coordinate: null,
            coordInput: { system, x: null, y: null, text: wert },
            coordSource: source,
            accuracyM,
            header,
            headerOrigin: origin,
            headerEvidence: {},
          }
        })
      }
      const ex = Number.parseFloat(String(x).replace(',', '.'))
      const ey = Number.parseFloat(String(y).replace(',', '.'))
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) return null
      return update((p) => {
        const { header, origin } = headerFuerNeueKoordinate(p)
        return {
          ...p,
          coordinate: null,
          coordInput: { system, x: ex, y: ey, text: '' },
          coordSource: source,
          accuracyM,
          header,
          headerOrigin: origin,
          headerEvidence: {},
        }
      })
    },

    async fetchHeader() {
      const current = plot()
      // Ältere, vor Aufgabe 12 gespeicherte Plots tragen noch keinen
      // coordInput — für sie gilt weiterhin WGS 84 aus coordinate.
      const input = current?.coordInput
        ?? (current?.coordinate ? { system: '4326', x: current.coordinate.lon, y: current.coordinate.lat, text: '' } : null)
      if (!input) return
      // Eine zweite Abfrage bricht die erste ab; das ist der Normalfall
      // beim Nachtippen einer Koordinate, kein Fehler.
      headerAbort?.abort()
      headerAbort = new AbortController()
      const signal = headerAbort.signal
      store.set({ headerPending: true, error: null })
      try {
        const { header, origin, evidence, coordinate } = await ortus.lookup({ ...input, signal })
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
          // Bei einer Eingabe außerhalb WGS 84 war die Gradkoordinate bis
          // hierhin unbekannt (coordinate: null) — jetzt trägt die Antwort
          // sie nach (siehe wgs84Of() im ortus-Adapter). Bei WGS 84 ist es
          // derselbe Wert, den setCoordinate schon gesetzt hatte.
          return { ...p, coordinate: coordinate ?? p.coordinate, header: mergedHeader, headerOrigin: mergedOrigin, headerEvidence: evidence }
        }, { extra: { headerPending: false } })
      } catch (err) {
        // Ein Abbruch ist kein Fehler, sondern der Normalfall beim
        // Nachtippen einer Koordinate. headerPending wird hier NICHT
        // zurückgesetzt: der Abbruch kommt immer von einer nachfolgenden
        // Abfrage, die bereits läuft — der Ladezustand gehört dann ihr.
        if (err?.name === 'AbortError') return
        store.set({ headerPending: false, error: err })
      }
    },

    // Ein geleertes Feld ist keine Eingabe, sondern das Gegenteil: es wird
    // zu 'missing' und blockiert damit die Auswertung. Würde es als
    // "von Hand gesetzt" mit dem Wert null (oder, aus einem Zahlenfeld,
    // mit 0) gelten, ginge dieser Wert still an habitatus.
    setHeaderField(field, value) {
      const leer = value === null || value === undefined || value === ''
      return update((p) => ({
        ...p,
        header: { ...p.header, [field]: leer ? null : value },
        headerOrigin: { ...p.headerOrigin, [field]: leer ? 'missing' : 'manual' },
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
        // Die Leeroption der Klassenauswahl schickt einen leeren Code: das
        // heißt "keine Deckung", nicht "unbekannte Klasse" — toPercent
        // würde hier sonst werfen, und Anzeige und Datenbestand liefen
        // auseinander.
        const gewaehlt = classCode !== undefined
        const value = gewaehlt ? (classCode === '' ? null : toPercent(scale, classCode)) : percent
        const species = p.species.map((s, i) =>
          i === index
            ? { ...s, cover: value, coverClass: value === null ? null : classFor(scale, value) }
            : s,
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
        // Kollision wie Schreibfehler: beide sind für den Nutzer bestimmt
        // und dürfen nicht als unbehandelter Fehler enden.
        if (err instanceof CollisionError || err instanceof StorageFullError) {
          store.set({ error: err })
          return null
        }
        throw err
      }
    },

    blockingReason() {
      const current = plot()
      if (!current) return 'Kein Plot geöffnet.'
      // Solange der Abruf läuft, gehören die angezeigten Kopfdaten noch
      // nicht sicher zur aktuellen Koordinate. Ohne diesen Grund wäre der
      // Auswerten-Knopf frei, während die Maske "Kopfdaten werden geholt …"
      // zeigt — abgesetzt würden dann die Kopfdaten des alten Punktes.
      if (store.get().headerPending) return 'Kopfdaten werden noch geholt.'
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
          { dirty: false, extra: { evaluating: false } },
        )
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
          { dirty: false, extra: { evaluating: false, error: err } },
        )
      }
    },
  }
}
