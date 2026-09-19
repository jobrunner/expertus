// Alle Oberflächentexte an einer Stelle. Verstreut man sie, heißt "?" an
// einer Stelle "keine Regel trifft" und an der nächsten gar nichts.

const RESULT = { '?': 'keine Regel trifft', '+': 'mehrdeutig' }
const STATUS = { none: 'nicht ausgewertet', ok: 'ausgewertet', stale: 'veraltet', error: 'Fehler' }
const ORIGIN = { ortus: 'aus ortus', manual: 'von Hand gesetzt', missing: 'nicht ableitbar' }

export function resultLabel(result) {
  if (result === null || result === undefined) return 'nicht ausgewertet'
  return RESULT[result] ?? result
}

export const statusLabel = (status) => STATUS[status] ?? status
// Der Zustandswert 'missing' trägt zwei verschiedene Bedeutungen: vor dem
// ersten Abruf wurde nur noch nicht gefragt, danach konnte das Feld nicht
// abgeleitet werden. Der Wert selbst bleibt gleich — er sperrt die
// Auswertung (siehe missingFields in header-map.js) und darf sich nicht
// ändern, nur weil die Maske ihn anders benennen will.
export const originLabel = (origin, abgefragt = true) =>
  origin === 'missing' && !abgefragt ? 'noch nicht abgefragt' : (ORIGIN[origin] ?? origin)

// Kein toLocaleDateString: dessen Ausgabe hängt von der Umgebung ab, und
// die Liste soll überall gleich aussehen. Der Index hält einen ISO-Stempel;
// gezeigt wird der Tag, die Uhrzeit trägt in der Übersicht nichts bei.
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'
}

export function formatCoord(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(6) : '—'
}

function percent(n) {
  return `${String(n).replace('.', ',')} %`
}

export function formatCover({ cover, coverClass }) {
  if (cover === null || cover === undefined) return 'ohne Deckung'
  return coverClass ? `${coverClass} (${percent(cover)})` : percent(cover)
}
