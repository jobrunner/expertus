// hostus: Autosuggest für Pflanzennamen.
//
// habitatus erwartet den akzeptierten Euro+Med-Namen. hostus wertet den
// Parameter backbone= derzeit nicht aus und verdrängt EuroSL-Treffer im
// Ranking (geprüft 2026-09-14: q=Festuca ovina, limit=50 → 0 EuroSL).
// Deshalb sortieren wir EuroSL nach oben, statt zu filtern; die Ansicht
// markiert die übrigen. Sobald hostus filtern kann, wird aus der Sortierung
// ein Filter — eine Zeile.
import { ServiceError, readError, rethrowAbort } from './errors.js'

const DEFAULT_LIMIT = 20

export function createHostus({ baseUrl, fetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '')

  return {
    async suggest(q, { limit = DEFAULT_LIMIT, signal } = {}) {
      const query = String(q ?? '').trim()
      if (!query) return []

      const url = `${base}/v1/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
      let res
      try {
        res = await fetch(url, { signal })
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`hostus ist nicht erreichbar: ${err.message}`, {
          kind: 'network',
          service: 'hostus',
        })
      }
      if (!res.ok) throw await readError(res, 'hostus')

      let body
      try {
        body = await res.json()
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`Antwort von hostus nicht lesbar: ${err.message}`, {
          kind: 'service',
          service: 'hostus',
        })
      }

      return (body.results ?? []).map(normalize).sort(euroSlFirst)
    },
  }
}

function normalize(r) {
  const backbone = String(r.concept_id ?? '').split(':')[0]
  return {
    conceptId: r.concept_id,
    name: stripCounterSuffix(r.canonical ?? r.display ?? ''),
    rank: r.rank,
    status: r.status,
    backbone,
    isEuroSl: backbone === 'eurosl',
    secTitle: r.sec?.title ?? null,
  }
}

// Stabil: gleiche Zugehörigkeit behält die Reihenfolge des Dienstes, der
// bereits nach Relevanz sortiert.
function euroSlFirst(a, b) {
  return Number(b.isEuroSl) - Number(a.isEuroSl)
}

// EuroSL hängt an mehrfach vergebene Namen einen Zähler: "Festuca ovina.1".
// Mit ihm trifft der Name in ESy nichts. Abgeschnitten wird nur ein Punkt
// gefolgt von reinen Ziffern am Ende — "aggr." und "subsp." bleiben stehen.
export function stripCounterSuffix(name) {
  return String(name).replace(/\.\d+$/, '')
}
