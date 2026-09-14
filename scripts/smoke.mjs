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

// erwarteBelege: die Belegfelder, an denen die Anzeige hängt. Sie fließen
// nirgends in die Auswertung ein, stehen aber als Nebentext in der Maske —
// eine Umbenennung in ortus (etwa des Ökoregion-Namens) bräche sie sonst
// unbemerkt, weil die sieben Kopfdaten davon unberührt blieben.
const PUNKTE = [
  { name: 'Berlin', lat: 52.52, lon: 13.405, erwarteVollstaendig: true, erwarteBelege: ['ecoName', 'elevationSource'] },
  { name: 'Sylt', lat: 54.9, lon: 8.31, erwarteVollstaendig: true, erwarteBelege: ['seaRegion', 'ecoName', 'elevationSource'] },
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
    const { header, origin, evidence } = await ortus.lookup({ lat: p.lat, lon: p.lon })
    const fehlend = missingFields(origin)
    for (const beleg of p.erwarteBelege ?? []) {
      const wert = evidence?.[beleg]
      melde(Boolean(wert), `ortus ${p.name}: Beleg ${beleg} belegt (${wert || 'leer'})`)
    }
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
    // Kein Fehler, sondern die Annahme hinter der Vorzugsregel: hostus
    // stellt EuroSL-Treffer nach vorn, garantiert sie aber nicht. Ein
    // harter Filter auf EuroSL würde die Liste hier leeren.
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
