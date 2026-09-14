#!/usr/bin/env node
// Abgleich gegen die echten Dienste. Prüft nicht die Fachlichkeit, sondern
// das Format: liefert ortus noch die Felder, aus denen wir die Kopfdaten
// ableiten? Antwortet habitatus auf einen gültigen Request? Kennt hostus
// den Suggest-Pfad?
//
// Absichtlich nicht in der CI: fremde Dienste, fremde Verfügbarkeit.
import { createOrtus } from '../src/adapters/ortus.js'
import { createHostus } from '../src/adapters/hostus.js'
import { createHabitatus } from '../src/adapters/habitatus.js'
import { HEADER_FIELDS, missingFields } from '../src/header-map.js'

const ORTUS = process.env.ORTUS_BASE_URL ?? 'https://ortus.fieldworksdiary.org'
const HOSTUS = process.env.HOSTUS_BASE_URL ?? 'https://hostus.fieldworksdiary.org'
const HABITATUS = process.env.HABITATUS_BASE_URL ?? 'https://habitatus.fieldworksdiary.org'

const PUNKTE = [
  { name: 'Berlin', lat: 52.52, lon: 13.405, erwarteVollstaendig: true },
  { name: 'Sylt', lat: 54.9, lon: 8.31, erwarteVollstaendig: true },
  { name: 'Ostsee/Darß', lat: 54.45, lon: 12.45, erwarteVollstaendig: false, erwarteFehlend: ['Ecoreg'] },
]

let fehler = 0
const melde = (ok, text) => {
  console.log(`${ok ? '✓' : '✗'} ${text}`)
  if (!ok) fehler++
}

const ortus = createOrtus({ baseUrl: ORTUS })
let kopf = null

for (const p of PUNKTE) {
  try {
    const { header, origin } = await ortus.lookup({ lat: p.lat, lon: p.lon })
    const fehlend = missingFields(origin)
    if (p.erwarteVollstaendig) {
      melde(fehlend.length === 0, `ortus ${p.name}: alle ${HEADER_FIELDS.length} Kopfdaten (fehlend: ${fehlend.join(', ') || 'keine'})`)
      kopf ??= header
    } else {
      const gleich = JSON.stringify(fehlend) === JSON.stringify(p.erwarteFehlend)
      melde(gleich, `ortus ${p.name}: erwartet fehlend ${p.erwarteFehlend.join(', ')}, gemeldet ${fehlend.join(', ') || 'keine'}`)
    }
  } catch (err) {
    melde(false, `ortus ${p.name}: ${err.message}`)
  }
}

try {
  const treffer = await createHostus({ baseUrl: HOSTUS }).suggest('Festuca ovina', { limit: 20 })
  melde(treffer.length > 0, `hostus: ${treffer.length} Vorschläge, davon ${treffer.filter((t) => t.isEuroSl).length} aus EuroSL`)
  if (treffer.length && treffer.every((t) => !t.isEuroSl)) {
    // Kein Fehler, aber die Annahme hinter der Vorzugsregel: siehe Plan,
    // Abschnitt "Annahmen".
    console.log('  Hinweis: kein EuroSL-Treffer — die Vorzugsregel greift, ein Filter würde die Liste leeren.')
  }
} catch (err) {
  melde(false, `hostus: ${err.message}`)
}

if (kopf) {
  try {
    const res = await createHabitatus({ baseUrl: HABITATUS }).classify({
      header: kopf,
      species: [{ name: 'Festuca ovina', cover: 37.5 }, { name: 'Nardus stricta', cover: 15 }],
      sampleId: 'smoke',
    })
    melde(typeof res.result === 'string', `habitatus: Ergebnis ${res.result}, ${res.matches.length} Treffer, Regelwerk ${res.versions.rulepack ?? '?'}`)
  } catch (err) {
    melde(false, `habitatus: ${err.message}`)
  }
} else {
  melde(false, 'habitatus: übersprungen, weil ortus keine vollständigen Kopfdaten lieferte')
}

process.exit(fehler ? 1 : 0)
