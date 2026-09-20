// Plots im Local Storage. Der Plot liegt unter expertus.plot.<sampleId>,
// daneben ein Index unter expertus.index — damit Liste und Suche nicht alle
// Plots deserialisieren müssen.

const INDEX_KEY = 'expertus.index'
const PLOT_PREFIX = 'expertus.plot.'

export class CollisionError extends Error {
  constructor(sampleId) {
    super(`Die Sample-ID ${sampleId} ist bereits vergeben.`)
    this.name = 'CollisionError'
    this.sampleId = sampleId
  }
}

// Ein fehlgeschlagener Schreibvorgang verliert die Eingabe endgültig: es
// gibt weder serverseitige Ablage noch Export, der Browser ist die einzige
// Kopie. Der Fehler bekommt deshalb einen eigenen Typ, damit die Aktionen
// ihn erkennen und in der Maske anzeigen können, statt ihn als
// unbehandelten Fehler in der Konsole enden zu lassen.
export class StorageFullError extends Error {
  constructor(cause) {
    super('Der lokale Speicher des Browsers ist voll — die letzte Eingabe wurde nicht gesichert. Bitte nicht mehr benötigte Plots löschen und die Eingabe wiederholen.')
    this.name = 'StorageFullError'
    this.cause = cause
  }
}

// Die Speicherfunktionen stehen auf Modulebene und bekommen ihre
// Abhängigkeiten als erstes Argument. Als Closures in createStorage
// rechnete der Komplexitätsmesser sie alle der umschließenden Funktion zu —
// derselbe Grund wie bei den Aktionen. Explizite Abhängigkeiten machen
// zudem sichtbar, was eine Funktion wirklich anfasst.

function readIndex({ backend }) {
  // Ein beschädigter Index ist ärgerlich, aber kein Grund, die App
  // unbenutzbar zu machen: die Plots selbst liegen unversehrt daneben.
  try {
    const raw = backend.getItem(INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeIndex({ backend }, entries) {
  backend.setItem(INDEX_KEY, JSON.stringify(entries))
}

function load({ backend }, sampleId) {
  const raw = backend.getItem(PLOT_PREFIX + sampleId)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function save(deps, plot) {
  const stamp = deps.now()
  const stored = { ...plot, createdAt: plot.createdAt ?? stamp, updatedAt: stamp }
  // Voller Speicher, privater Modus, Speicherdruck auf Mobilgeräten: das
  // Schreiben kann werfen. Dann muss oben etwas davon erfahren — ein
  // stilles Durchrutschen hieße, dass der Nutzer im Gelände weiter
  // erfasst, ohne dass irgendetwas gesichert wird.
  try {
    deps.backend.setItem(PLOT_PREFIX + stored.sampleId, JSON.stringify(stored))
    const rest = readIndex(deps).filter((e) => e.sampleId !== stored.sampleId)
    writeIndex(deps, [entryFor(stored), ...rest].sort(byUpdatedDesc))
  } catch (err) {
    throw new StorageFullError(err)
  }
  return stored
}

function remove(deps, sampleId) {
  deps.backend.removeItem(PLOT_PREFIX + sampleId)
  writeIndex(deps, readIndex(deps).filter((e) => e.sampleId !== sampleId))
}

function rename(deps, oldId, newId) {
  if (oldId === newId) return load(deps, oldId)
  if (load(deps, newId)) throw new CollisionError(newId)
  const plot = load(deps, oldId)
  if (!plot) throw new Error(`Plot ${oldId} gibt es nicht.`)
  const moved = save(deps, { ...plot, sampleId: newId })
  remove(deps, oldId)
  return moved
}

function search(deps, { q = '', status = null } = {}) {
  const needle = q.trim().toLowerCase()
  return readIndex(deps).filter((e) => passtZurSuche(e, needle, status))
}

// Als Pfeilfunktion im Filter zählte diese Prüfung zur umschließenden
// Funktion; benannt ist sie außerdem für sich lesbar.
function passtZurSuche(eintrag, needle, status) {
  if (status && eintrag.status !== status) return false
  if (!needle) return true
  const haystack = [eintrag.sampleId, eintrag.result ?? '', ...(eintrag.speciesNames ?? [])].join(' ').toLowerCase()
  return haystack.includes(needle)
}

function nextSampleId(deps) {
  const day = deps.now().slice(0, 10)
  const prefix = `P-${day}-`
  const taken = readIndex(deps)
    .filter((e) => e.sampleId.startsWith(prefix))
    .map((e) => Number.parseInt(e.sampleId.slice(prefix.length), 10))
    .filter(Number.isInteger)
  return prefix + (taken.length ? Math.max(...taken) + 1 : 1)
}

export function createStorage({ backend, now = () => new Date().toISOString() }) {
  const deps = { backend, now }
  return {
    list: () => readIndex(deps).sort(byUpdatedDesc),
    load: load.bind(null, deps),
    save: save.bind(null, deps),
    remove: remove.bind(null, deps),
    rename: rename.bind(null, deps),
    search: search.bind(null, deps),
    nextSampleId: nextSampleId.bind(null, deps),
  }
}

// Der Status ist abgeleitet, nicht gespeichert: eine zweite Wahrheit über
// denselben Sachverhalt geht irgendwann auseinander.
function entryFor(plot) {
  return {
    sampleId: plot.sampleId,
    updatedAt: plot.updatedAt,
    lat: plot.coordinate?.lat ?? null,
    lon: plot.coordinate?.lon ?? null,
    speciesCount: plot.species?.length ?? 0,
    speciesNames: (plot.species ?? []).map((s) => s.name),
    result: plot.evaluation?.response?.result ?? null,
    status: plot.evaluation?.status ?? 'none',
  }
}

function byUpdatedDesc(a, b) {
  return String(b.updatedAt).localeCompare(String(a.updatedAt))
}

// Jede Änderung nach einer erfolgreichen Auswertung macht deren Ergebnis
// veraltet. Gelöscht wird es nicht: der Nutzer soll sehen, was vorher
// herauskam, und daneben, dass es nicht mehr zur Artenliste passt.
export function markDirty(plot) {
  if (plot.evaluation?.status !== 'ok') return plot
  return { ...plot, evaluation: { ...plot.evaluation, status: 'stale' } }
}
