// situs: Nachschlagewerk zu einem erkannten Habitattyp — Name, Beschreibung,
// die Pflanzengesellschaften (Syntaxa) und die Arten mit ihrer Rolle.
//
// Die Typologie steht fest auf EUNIS 2021. habitatus nennt in versions zwar
// sein Regelwerk ("EUNIS-ESy-2025-10-03.txt"), aber keine EUNIS-Fassung;
// situs führt beide (eunis@2012 und eunis@2021). ESy 2025 arbeitet gegen
// EUNIS 2021, und die Beschreibungen in situs stammen aus
// floraveg:eunis-habitat-factsheets:2021-06-01 — deshalb diese. Nennt
// habitatus eines Tages eine Fassung, gehört sie hierher statt in eine
// Annahme.
import { ServiceError, readError, rethrowAbort } from './errors.js'

const TYPOLOGIE = 'eunis@2021'

// situs liefert Name und Beschreibung zusätzlich auf Deutsch, wenn man
// danach fragt; name_en bleibt dabei immer gesetzt. Beides wird angezeigt:
// der deutsche Text ist im Gelände schneller zu erfassen, der englische
// ist der amtliche EUNIS-Wortlaut, an dem sich Literatur und Schlüssel
// orientieren.
const SPRACHE = 'de'

// Die Reihenfolge, in der die Rollen angezeigt werden. Diagnostische Arten
// stehen oben, weil sie den Typ kennzeichnen; konstante und dominante
// beschreiben ihn.
export const ROLLEN = [
  ['diagnostic', 'diagnostisch'],
  ['constant', 'konstant'],
  ['dominant', 'dominant'],
]

export function createSitus({ baseUrl, fetch = globalThis.fetch }) {
  const deps = { base: String(baseUrl ?? '').replace(/\/+$/, ''), fetch }
  return { habitatType: habitatType.bind(null, deps) }
}

// Liefert null, wenn situs den Code nicht führt. Das ist kein Fehler, den
// die Maske melden müsste: das Ergebnis der Auswertung steht trotzdem, nur
// das Nachschlagewerk kennt diesen Typ nicht.
//
// Auf Modulebene statt als Closure in createSitus: der Komplexitätsmesser
// rechnet jede Closure der umschließenden Funktion zu, und dieselbe Form
// hat sich schon bei den Aktionen und beim Speicher bewährt.
async function habitatType({ base, fetch }, code, { signal } = {}) {
  const kennung = String(code ?? '').trim()
  if (!base || !kennung) return null

  const url = `${base}/v1/habitat-type/${encodeURIComponent(TYPOLOGIE)}/${encodeURIComponent(kennung)}`
    + `?lang=${encodeURIComponent(SPRACHE)}`
  const res = await hole(fetch, url, signal)
  if (res.status === 404) return null
  if (!res.ok) throw await readError(res, 'situs')
  return normalize(await lies(res))
}

async function hole(fetch, url, signal) {
  try {
    return await fetch(url, { signal })
  } catch (err) {
    rethrowAbort(err)
    throw new ServiceError(`situs ist nicht erreichbar: ${err.message}`, {
      kind: 'network',
      service: 'situs',
    })
  }
}

async function lies(res) {
  try {
    return await res.json()
  } catch (err) {
    rethrowAbort(err)
    throw new ServiceError(`Antwort von situs nicht lesbar: ${err.message}`, {
      kind: 'service',
      service: 'situs',
    })
  }
}

function normalize(b) {
  return {
    code: b.code ?? null,
    name: b.name_en ?? null,
    // Der deutsche Name und der volkstümliche daneben — letzteren führt
    // situs nicht zu jedem Typ, er bleibt dann leer.
    nameDe: b.name_de?.value ?? null,
    nameVolkstuemlich: b.name_de?.vernacular ?? null,
    beschreibung: b.description?.value ?? null,
    beschreibungDe: b.description_de?.value ?? null,
    // Woher die Beschreibung stammt, gehört sichtbar dazu: sie ist zitiert,
    // nicht selbst formuliert.
    quelle: b.description?.source ?? null,
    syntaxa: (b.syntaxa ?? []).map(syntaxon),
    arten: artenNachRolle(b.species),
  }
}

// Je eigene Funktion statt Pfeilfunktionen im Rumpf von normalize(): jeder
// ??-Operator zählt als Verzweigung, und gesammelt trieben sie die
// Komplexität der umschließenden Funktion über die Schranke.
function syntaxon(s) {
  return {
    id: s.id ?? null,
    rang: s.rank ?? null,
    name: s.name ?? '',
    autor: s.author ?? null,
  }
}

function artenNachRolle(species) {
  return Object.fromEntries(
    ROLLEN.map(([schluessel]) => [schluessel, (species?.[schluessel] ?? []).filter(eigenstaendig).map(art)]),
  )
}

// situs leitet aus einem Sammeltaxon dessen Einzelarten ab und führt sie
// mit provenance "derived_from_aggregate" in der Liste. Fachlich sagen sie
// nichts über den Habitattyp aus, was das Aggregat nicht schon sagt, und
// sie machen die Liste unübersichtlich: bei R22 sind 76 von 161 Einträgen
// solche Ableitungen, bei R1A 38 von 116. Angezeigt werden deshalb nur
// Arten, die situs unmittelbar führt.
function eigenstaendig(a) {
  return a.provenance !== 'derived_from_aggregate'
}

function art(a) {
  return {
    conceptId: a.concept_id ?? null,
    name: a.verbatim_name ?? '',
    // Stetigkeit bzw. Treue, je nach Rolle — situs liefert nur den
    // jeweils sinnvollen Wert.
    constancy: a.constancy ?? null,
    fidelity: a.fidelity ?? null,
  }
}
