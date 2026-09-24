// Orchestrierung. Die einzige Stelle, die mehrere Adapter kennt; Ansichten
// rufen Aktionen, nie Adapter.
import { HEADER_FIELDS, missingFields } from './header-map.js'
import { markDirty, CollisionError, StorageFullError } from './storage.js'
import { classFor, isValidPercent, toPercent } from './cover.js'

function emptyHeader() {
  return Object.fromEntries(HEADER_FIELDS.map((f) => [f, null]))
}

function emptyOrigin() {
  return Object.fromEntries(HEADER_FIELDS.map((f) => [f, 'missing']))
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
function update({ store, storage }, mutate, { dirty = true, extra = {} } = {}) {
  const current = store.get().plot
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

function newPlot({ store, storage }) {
  const fresh = {
    sampleId: storage.nextSampleId(),
    coordinate: null,
    coordInput: null,
    coordSource: null,
    accuracyM: null,
    header: emptyHeader(),
    headerOrigin: emptyOrigin(),
    headerEvidence: {},
    // Die botanische Region für die Artensuche. Sie stammt wie die
    // Kopfdaten aus ortus, geht aber nicht an habitatus.
    tdwgRegion: null,
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
}

function openPlot(deps, sampleId) {
  const { store, storage } = deps
  const found = storage.load(sampleId)
  store.set({ plot: found, error: null })
  // Ein gespeicherter Plot bringt sein Ergebnis mit, die Angaben dazu
  // nicht. Ohne await: das Öffnen soll nicht auf ein Nachschlagewerk
  // warten, das vielleicht gar nicht eingerichtet ist.
  const code = found?.evaluation?.response?.result
  if (code) fetchHabitat(deps, code)
  return found
}

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
function setCoordinate(deps, { lat, lon, source, accuracyM = null }) {
  return update(deps, (p) => {
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
      tdwgRegion: null,
    }
  })
}

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
function setCoordinateInput(deps, { system, x, y, text, source, accuracyM = null }) {
  if (system === '4326') {
    const lon = Number.parseFloat(String(x).replace(',', '.'))
    const lat = Number.parseFloat(String(y).replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return setCoordinate(deps, { lat, lon, source, accuracyM })
  }
  if (system === 'mgrs') {
    const wert = String(text ?? '').trim()
    if (!wert) return null
    return update(deps, (p) => {
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
      tdwgRegion: null,
      }
    })
  }
  const ex = Number.parseFloat(String(x).replace(',', '.'))
  const ey = Number.parseFloat(String(y).replace(',', '.'))
  if (!Number.isFinite(ex) || !Number.isFinite(ey)) return null
  return update(deps, (p) => {
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
      tdwgRegion: null,
    }
  })
}

// Von Hand korrigierte Felder überleben eine später eintreffende
// ortus-Antwort: eine bewusste Korrektur des Nutzers würde sonst
// kommentarlos überschrieben.
function mergeIncomingHeader(p, header, origin) {
  const mergedHeader = { ...p.header }
  const mergedOrigin = { ...p.headerOrigin }
  for (const field of Object.keys(header)) {
    if (p.headerOrigin?.[field] === 'manual') continue
    mergedHeader[field] = header[field]
    mergedOrigin[field] = origin[field]
  }
  return { header: mergedHeader, origin: mergedOrigin }
}

async function fetchHeader(deps, state) {
  const { store, ortus } = deps
  const current = store.get().plot
  // Ältere, vor Aufgabe 12 gespeicherte Plots tragen noch keinen
  // coordInput — für sie gilt weiterhin WGS 84 aus coordinate.
  const input = current?.coordInput
    ?? (current?.coordinate ? { system: '4326', x: current.coordinate.lon, y: current.coordinate.lat, text: '' } : null)
  if (!input) return
  // Eine zweite Abfrage bricht die erste ab; das ist der Normalfall
  // beim Nachtippen einer Koordinate, kein Fehler.
  state.headerAbort?.abort()
  state.headerAbort = new AbortController()
  const signal = state.headerAbort.signal
  store.set({ headerPending: true, error: null })
  try {
    const { header, origin, evidence, coordinate, tdwgRegion } = await ortus.lookup({ ...input, signal })
    // Den Plot-Stand erst NACH dem Abruf lesen: zwischen Start und
    // Eintreffen der Antwort kann der Nutzer Felder von Hand gesetzt
    // haben. Ein von Hand korrigierter Wert bleibt Vorrang vor der
    // später eintreffenden ortus-Antwort — sonst würde eine bewusste
    // Korrektur des Nutzers kommentarlos wieder überschrieben.
    update(deps, (p) => {
      const { header: mergedHeader, origin: mergedOrigin } = mergeIncomingHeader(p, header, origin)
      // Bei einer Eingabe außerhalb WGS 84 war die Gradkoordinate bis
      // hierhin unbekannt (coordinate: null) — jetzt trägt die Antwort
      // sie nach (siehe wgs84Of() im ortus-Adapter). Bei WGS 84 ist es
      // derselbe Wert, den setCoordinate schon gesetzt hatte.
      return { ...p, coordinate: coordinate ?? p.coordinate, header: mergedHeader, headerOrigin: mergedOrigin, headerEvidence: evidence, tdwgRegion: tdwgRegion ?? null }
    }, { extra: { headerPending: false } })
  } catch (err) {
    // Ein Abbruch ist kein Fehler, sondern der Normalfall beim
    // Nachtippen einer Koordinate. headerPending wird hier NICHT
    // zurückgesetzt: der Abbruch kommt immer von einer nachfolgenden
    // Abfrage, die bereits läuft — der Ladezustand gehört dann ihr.
    if (err?.name === 'AbortError') return
    store.set({ headerPending: false, error: err })
  }
}

// Ein geleertes Feld ist keine Eingabe, sondern das Gegenteil: es wird
// zu 'missing' und blockiert damit die Auswertung. Würde es als
// "von Hand gesetzt" mit dem Wert null (oder, aus einem Zahlenfeld,
// mit 0) gelten, ginge dieser Wert still an habitatus.
function setHeaderField(deps, field, value) {
  const leer = value === null || value === undefined || value === ''
  return update(deps, (p) => ({
    ...p,
    header: { ...p.header, [field]: leer ? null : value },
    headerOrigin: { ...p.headerOrigin, [field]: leer ? 'missing' : 'manual' },
  }))
}

function addSpecies(deps, { name, conceptId = null, entry = 'manual' }) {
  return update(deps, (p) => ({
    ...p,
    species: [...p.species, { name, conceptId, cover: null, coverClass: null, entry }],
  }))
}

function removeSpecies(deps, index) {
  return update(deps, (p) => ({ ...p, species: p.species.filter((_, i) => i !== index) }))
}

function setCover(deps, index, { percent, classCode }) {
  return update(deps, (p) => {
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
}

// Der Prozentwert ist die Wahrheit; der Umschalter wechselt nur das
// Eingabewerkzeug. Existiert die Klasse in der neuen Skala nicht, fällt
// das Etikett weg — gerundet wird nicht, das würde eine nie gemachte
// Messung erfinden.
function setScale(deps, scale) {
  return update(deps, (p) => ({
    ...p,
    scale,
    species: p.species.map((s) => ({ ...s, coverClass: s.cover === null ? null : classFor(scale, s.cover) })),
  }))
}

// Umbenennen ändert die Auswertungsgrundlage nicht: das Ergebnis passt
// weiterhin zur selben Artenliste. storage.rename kapselt Speichern und
// Index bereits; markDirty wäre hier sachlich falsch und würde eine
// gültige Auswertung durch bloßes Umbenennen entwerten.
function rename({ store, storage }, newId) {
  try {
    const moved = storage.rename(store.get().plot.sampleId, newId)
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
}

function blockingReason({ store }) {
  const current = store.get().plot
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
}

// Holt das Nachschlagewerk zu einem erkannten Habitattyp. Eigene Aktion
// statt eines Anhängsels an evaluate(): die Angaben werden auch gebraucht,
// wenn ein längst gespeicherter Plot wieder geöffnet wird — sein Ergebnis
// liegt dann vor, die Beschreibung dazu nicht.
//
// Nicht im Plot gespeichert, sondern nur im Zustand gehalten: es sind
// Nachschlagedaten, keine Erfassung. Im Plot lägen sie als Kopie herum, die
// veraltet, sobald situs seine Artefakte erneuert.
async function fetchHabitat(deps, code, { erneut = false } = {}) {
  const { store, situs } = deps
  if (!code) return
  const vorhanden = store.get().habitat
  // Zu diesem Code ist schon etwas bekannt — auch ein Fehler zählt dazu.
  //
  // Dass ein Fehlschlag hier abblockt, ist der entscheidende Punkt: der
  // Abruf wird beim Zeichnen angestoßen, und das Setzen des Fehlers zeichnet
  // neu. Würde nach einem Fehler von selbst erneut geholt, liefe daraus eine
  // Schleife, die einen ohnehin angeschlagenen Dienst mit Anfragen überzieht
  // — gemessen: Dutzende Anfragen in anderthalb Sekunden. Ein neuer Versuch
  // geschieht deshalb nur auf Zuruf, über den Knopf in der Ansicht.
  if (vorhanden?.code === code && !erneut) return

  store.set({ habitat: { code, data: null, pending: true, error: null } })
  try {
    const data = await situs.habitatType(code)
    // Inzwischen ein anderer Typ: die späte Antwort gehört nicht mehr zur
    // Anzeige und würde sonst den neueren Stand überschreiben.
    if (store.get().habitat?.code !== code) return
    store.set({ habitat: { code, data, pending: false, error: null } })
  } catch (err) {
    if (store.get().habitat?.code !== code) return
    // Kein store.set({ error }): ein ausgefallenes Nachschlagewerk darf die
    // Maske nicht mit einer Fehlermeldung überziehen. Das Ergebnis der
    // Auswertung steht unabhängig davon.
    store.set({ habitat: { code, data: null, pending: false, error: err } })
  }
}

async function evaluate(deps) {
  const { store, habitatus, now } = deps
  const reason = blockingReason(deps)
  if (reason) {
    store.set({ error: new Error(reason) })
    return
  }
  const current = store.get().plot
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
      deps,
      (p) => ({ ...p, evaluation: { at: now(), request: response.request, response, status: 'ok' } }),
      { dirty: false, extra: { evaluating: false } },
    )
    // Erst nach dem Speichern des Ergebnisses: der Abruf gehört in die
    // Aktion, nicht in die Ansicht. Ein store.set() aus einer
    // Renderfunktion heraus zeichnet mitten im laufenden Durchlauf neu —
    // gemessen entstanden dabei kurzzeitig zwei Ansichtsbäume.
    fetchHabitat(deps, response.result)
  } catch (err) {
    if (err?.name === 'AbortError') {
      store.set({ evaluating: false })
      return
    }
    // Ein Fehler lässt den Plot stehen: er bleibt gespeichert und
    // bearbeitbar, die Fehlermeldung des Dienstes wird unverändert
    // übernommen.
    update(
      deps,
      (p) => ({
        ...p,
        evaluation: { at: now(), request: null, response: null, status: 'error', message: err.message },
      }),
      { dirty: false, extra: { evaluating: false, error: err } },
    )
  }
}

// Jede Aktion bekommt dieselben Abhängigkeiten (deps) und holt sich daraus,
// was sie braucht — das macht an jeder Funktionssignatur sichtbar, worauf
// sie zugreift, ohne dass der Aufrufer sich um einzelne Parameter kümmern
// muss. Gebunden wird per .bind() statt über eine Wrapper-Closure je
// Aktion: eine Closure wäre selbst wieder eine (triviale) Funktion und
// würde als solche in der Komplexität dieser Funktion mitgezählt — bei 13
// Aktionen ein rein kosmetischer Aufschlag ohne jede Verzweigung darin.
// `state` hält den einzigen wirklich veränderlichen Zustand (den
// laufenden headerAbort) über mehrere fetchHeader()-Aufrufe hinweg.
export function createActions({ store, storage, ortus, habitatus, situs, now = () => new Date().toISOString() }) {
  const deps = { store, storage, ortus, habitatus, situs, now }
  const state = { headerAbort: null }
  return {
    newPlot: newPlot.bind(null, deps),
    openPlot: openPlot.bind(null, deps),
    setCoordinate: setCoordinate.bind(null, deps),
    setCoordinateInput: setCoordinateInput.bind(null, deps),
    fetchHeader: fetchHeader.bind(null, deps, state),
    fetchHabitat: fetchHabitat.bind(null, deps),
    setHeaderField: setHeaderField.bind(null, deps),
    addSpecies: addSpecies.bind(null, deps),
    removeSpecies: removeSpecies.bind(null, deps),
    setCover: setCover.bind(null, deps),
    setScale: setScale.bind(null, deps),
    rename: rename.bind(null, deps),
    blockingReason: blockingReason.bind(null, deps),
    evaluate: evaluate.bind(null, deps),
  }
}
