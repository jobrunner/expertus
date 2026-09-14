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
export const originLabel = (origin) => ORIGIN[origin] ?? origin

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
