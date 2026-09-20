// hostus: Autosuggest für Pflanzennamen.
//
// habitatus erwartet den akzeptierten Euro+Med-Namen, also fragen wir
// genau danach: target_space=eurosl liefert zu jedem Konzept den Namen aus
// diesem Namensraum, require_target_space=true wirft die Konzepte weg, die
// dort keinen haben.
//
// Zuvor stand hier ein Filter über das Präfix der concept_id. Der konnte
// nie greifen: hostus vergibt Kennungen wie "cdm:concept:…", "wcvp:…" oder
// "germansl:…", niemals "eurosl:…". Jeder Treffer galt damit als
// "nicht Euro+Med", und die Liste zeigte dasselbe Taxon vielfach — einmal
// je Referenzwerk (Feld sec), für den Anwender ununterscheidbar. Der
// Parameter hieß außerdem nie "backbone", sondern "entry_backbone"; die
// damalige Prüfung fragte also ins Leere.
//
// area ist die TDWG-Region (WGSRPD Level 3, etwa "GER") aus den Kopfdaten.
// Sie filtert nicht, sondern markiert: in_area sagt, ob das Konzept für das
// Gebiet verzeichnet ist. Ohne sie ist in_area in jeder Antwort false.
import { ServiceError, readError, rethrowAbort } from './errors.js'

const DEFAULT_LIMIT = 20

// Der Namensraum, den habitatus erwartet. Die gültigen Werte nennt
// /v1/spaces: eurosl, floraveg, germansl.
const TARGET_SPACE = 'eurosl'

export function createHostus({ baseUrl, fetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '')

  return {
    async suggest(q, { limit = DEFAULT_LIMIT, signal, area = null } = {}) {
      const query = String(q ?? '').trim()
      if (!query) return []

      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        target_space: TARGET_SPACE,
        require_target_space: 'true',
      })
      if (area) params.set('area', area)
      const url = `${base}/v1/suggest?${params}`
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

      return (body.results ?? []).map(normalize).sort(imGebietZuerst)
    },
  }
}

function normalize(r) {
  // Angezeigt und gespeichert wird der EuroSL-Name, denn genau er geht
  // später an habitatus. Der Name, unter dem hostus das Konzept führt,
  // kann davon abweichen ("Festuca niphobia" gegen "Festuca ovina subvar.
  // niphobia") und bleibt als Herkunftsangabe erhalten.
  const eurosl = stripCounterSuffix(r.target_space_name ?? '')
  const eigen = stripCounterSuffix(r.canonical ?? r.display ?? '')
  const name = eurosl || eigen
  return {
    conceptId: r.concept_id,
    name,
    matchedName: eigen && eigen !== name ? eigen : null,
    rank: r.rank,
    status: r.status,
    inArea: r.in_area === true,
    secTitle: r.sec?.title ?? null,
  }
}

// Stabil: gleiche Zugehörigkeit behält die Reihenfolge des Dienstes, der
// bereits nach Relevanz sortiert. Ohne area ist inArea überall false, dann
// ändert die Sortierung nichts.
function imGebietZuerst(a, b) {
  return Number(b.inArea) - Number(a.inArea)
}

// EuroSL hängt an mehrfach vergebene Namen einen Zähler: "Festuca ovina.1".
// Mit ihm trifft der Name in ESy nichts. Abgeschnitten wird nur ein Punkt
// gefolgt von reinen Ziffern am Ende — "aggr." und "subsp." bleiben stehen.
export function stripCounterSuffix(name) {
  return String(name).replace(/\.\d+$/, '')
}
