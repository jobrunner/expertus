// Ableitung der ESy-Kopfdaten aus einer ortus-Antwort.
//
// Das Herz ist die Tabelle FIELDS: eine neue Quelle in ortus ist eine Zeile,
// kein Umbau. Was hier NICHT passiert, ist ebenso wichtig — es wird nichts
// geraten. Habitatus zwingt intern jeden unauflösbaren Wert auf 0 und wertet
// danach zweiwertig aus; ein geratener Wert erzeugt dort also kein
// "unbekannt", sondern still ein falsches Ergebnis. Diese Datei ist die
// einzige Stelle im ganzen Weg, an der das auffallen kann.
import { esyCountryFor } from './esy-countries.js'

export const COAST_VALUES = ['ARC_COAST', 'ATL_COAST', 'BAL_COAST', 'BLA_COAST', 'MED_COAST', 'N_COAST']
export const DUNE_VALUES = ['N_DUNES', 'Y_DUNES']

export const HEADER_FIELDS = [
  'Country', 'Coast_EEA', 'Dunes_Bohn', 'Ecoreg', 'Altitude (m)', 'DEG_LAT', 'DEG_LON',
]

const FIELDS = {
  Country: (doc) => esyCountryFor(doc.gazetteer?.admin?.country_iso),
  Coast_EEA: (doc) => oneOf(prop(doc, 'coast-eea-2022', 'coast_eea', 'coast_eea'), COAST_VALUES),
  Dunes_Bohn: (doc) => oneOf(prop(doc, 'bohn-dunes-2019', 'dunes_bohn', 'dunes_bohn'), DUNE_VALUES),
  Ecoreg: (doc) => number(prop(doc, 'ecoregions-2017', 'ecoregions', 'ECO_ID')),
  'Altitude (m)': (doc) => number(doc.gazetteer?.elevation?.meters),
  DEG_LAT: (doc) => number(doc.coordinate?.y),
  DEG_LON: (doc) => number(doc.coordinate?.x),
}

export function deriveHeader(doc) {
  const header = {}
  const origin = {}
  for (const field of HEADER_FIELDS) {
    const value = FIELDS[field](doc) ?? null
    header[field] = value
    origin[field] = value === null ? 'missing' : 'ortus'
  }
  return { header, origin, evidence: evidenceOf(doc) }
}

export function missingFields(origin) {
  return HEADER_FIELDS.filter((f) => origin[f] === 'missing')
}

function evidenceOf(doc) {
  const out = {}
  const seaRegion = prop(doc, 'coast-eea-2022', 'coast_eea', 'sea_region')
  const bohnUnit = prop(doc, 'bohn-dunes-2019', 'dunes_bohn', 'bohn_unit')
  const ecoName = prop(doc, 'ecoregions-2017', 'ecoregions', 'ECO_NAME')
  const elevationSource = doc.gazetteer?.elevation?.source?.name
  if (seaRegion) out.seaRegion = seaRegion
  if (bohnUnit) out.bohnUnit = bohnUnit
  if (ecoName) out.ecoName = ecoName
  if (elevationSource) out.elevationSource = elevationSource
  return out
}

// Eine Quelle fehlt ganz, wenn sie für die Koordinate kein Feature hat —
// sie taucht dann nicht in results auf. Deshalb überall optional greifen.
function prop(doc, sourceId, layer, key) {
  const source = doc.results?.find((r) => r.source_id === sourceId)
  const feature = source?.features?.find((f) => f.layer === layer)
  return feature?.properties?.[key]
}

// Ein Wert außerhalb des Vokabulars wird verworfen statt durchgereicht:
// habitatus würde ihn mit 400 abweisen, und bis dahin sähe die Maske aus,
// als wäre alles in Ordnung.
function oneOf(value, allowed) {
  return allowed.includes(value) ? value : null
}

// Höhe 0 m ist ein gültiger Wert. Ohne diese Prüfung würde sie als fehlend
// gelten und jeden Küstenplot blockieren.
function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
