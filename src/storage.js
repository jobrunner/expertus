// Plots im Local Storage. Der Plot liegt unter legulus.plot.<sampleId>,
// daneben ein Index unter legulus.index — damit Liste und Suche nicht alle
// Plots deserialisieren müssen.

const INDEX_KEY = 'legulus.index'
const PLOT_PREFIX = 'legulus.plot.'

export class CollisionError extends Error {
  constructor(sampleId) {
    super(`Die Sample-ID ${sampleId} ist bereits vergeben.`)
    this.name = 'CollisionError'
    this.sampleId = sampleId
  }
}

export function createStorage({ backend, now = () => new Date().toISOString() }) {
  function readIndex() {
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

  function writeIndex(entries) {
    backend.setItem(INDEX_KEY, JSON.stringify(entries))
  }

  function load(sampleId) {
    const raw = backend.getItem(PLOT_PREFIX + sampleId)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function save(plot) {
    const stamp = now()
    const stored = { ...plot, createdAt: plot.createdAt ?? stamp, updatedAt: stamp }
    backend.setItem(PLOT_PREFIX + stored.sampleId, JSON.stringify(stored))
    const rest = readIndex().filter((e) => e.sampleId !== stored.sampleId)
    writeIndex([entryFor(stored), ...rest].sort(byUpdatedDesc))
    return stored
  }

  function remove(sampleId) {
    backend.removeItem(PLOT_PREFIX + sampleId)
    writeIndex(readIndex().filter((e) => e.sampleId !== sampleId))
  }

  function rename(oldId, newId) {
    if (oldId === newId) return load(oldId)
    if (load(newId)) throw new CollisionError(newId)
    const plot = load(oldId)
    if (!plot) throw new Error(`Plot ${oldId} gibt es nicht.`)
    const moved = save({ ...plot, sampleId: newId })
    remove(oldId)
    return moved
  }

  function search({ q = '', status = null } = {}) {
    const needle = q.trim().toLowerCase()
    return readIndex().filter((e) => {
      if (status && e.status !== status) return false
      if (!needle) return true
      const haystack = [e.sampleId, e.result ?? '', ...(e.speciesNames ?? [])].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }

  function nextSampleId() {
    const day = now().slice(0, 10)
    const prefix = `P-${day}-`
    const taken = readIndex()
      .filter((e) => e.sampleId.startsWith(prefix))
      .map((e) => Number.parseInt(e.sampleId.slice(prefix.length), 10))
      .filter(Number.isInteger)
    return prefix + (taken.length ? Math.max(...taken) + 1 : 1)
  }

  return { list: () => readIndex().sort(byUpdatedDesc), load, save, remove, rename, search, nextSampleId }
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
