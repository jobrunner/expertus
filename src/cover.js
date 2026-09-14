// Deckungsskalen. Habitatus nimmt ausschließlich Prozent und rechnet bewusst
// keine Skala um; diese Tabelle ist die einzige Stelle, an der die Umrechnung
// stattfindet. Sie ist verhaltensrelevant: Deckungen werden dienstseitig nach
// Jennings-Fischer vereinigt, nicht addiert, weshalb eine um eine Klasse
// verschobene Eingabe eine Schwelle kippen kann.

export const SCALES = {
  percent: { label: 'Prozent', classes: {} },
  'bb-classic': {
    label: 'Braun-Blanquet, klassisch',
    classes: { r: 0.1, '+': 0.5, 1: 2.5, 2: 15, 3: 37.5, 4: 62.5, 5: 87.5 },
  },
  'bb-extended': {
    label: 'Braun-Blanquet, erweitert',
    classes: { r: 0.1, '+': 0.5, 1: 2.5, '2m': 4, '2a': 10, '2b': 20, 3: 37.5, 4: 62.5, 5: 87.5 },
  },
}

// Objektschlüssel-Reihenfolge ist für Zifferncodes wie "1" nicht die
// Einfügereihenfolge, deshalb die Ordnung ausdrücklich über die Deckung.
export function classesFor(scale) {
  const def = SCALES[scale]
  if (!def) throw new RangeError(`Unbekannte Skala: ${scale}`)
  return Object.entries(def.classes)
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code)
}

export function toPercent(scale, classCode) {
  const def = SCALES[scale]
  if (!def) throw new RangeError(`Unbekannte Skala: ${scale}`)
  const value = def.classes[classCode]
  if (value === undefined) throw new RangeError(`Klasse ${classCode} gibt es in ${scale} nicht`)
  return value
}

export function classFor(scale, percent) {
  const def = SCALES[scale]
  if (!def) throw new RangeError(`Unbekannte Skala: ${scale}`)
  const hit = Object.entries(def.classes).find(([, v]) => v === percent)
  return hit ? hit[0] : null
}

export function isValidPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100
}
