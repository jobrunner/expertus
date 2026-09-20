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
  { name: 'Berlin', lat: 52.52, lon: 13.405, erwarteVollstaendig: true, erwarteBelege: ['ecoName', 'elevationSource'], erwarteRegion: 'GER' },
  { name: 'Sylt', lat: 54.9, lon: 8.31, erwarteVollstaendig: true, erwarteBelege: ['seaRegion', 'ecoName', 'elevationSource'], erwarteRegion: 'GER' },
  // Auf See gibt es keine botanische Region: WGSRPD deckt Landflächen ab.
  // Die Artensuche fragt dann ohne Gebietsbezug — das ist kein Fehler,
  // sondern der Fall, für den area optional bleibt.
  { name: 'Ostsee/Darß', lat: 54.45, lon: 12.45, erwarteVollstaendig: false, erwarteFehlend: ['Ecoreg'], erwarteRegion: null },
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
    const { header, origin, evidence, tdwgRegion } = await ortus.lookup({ system: '4326', x: p.lon, y: p.lat })
    const fehlend = missingFields(origin)
    for (const beleg of p.erwarteBelege ?? []) {
      const wert = evidence?.[beleg]
      melde(Boolean(wert), `ortus ${p.name}: Beleg ${beleg} belegt (${wert || 'leer'})`)
    }
    melde((tdwgRegion ?? null) === p.erwarteRegion,
      `ortus ${p.name}: TDWG-Region ${p.erwarteRegion ?? 'keine'} erwartet, geliefert ${tdwgRegion ?? 'keine'}`)
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
  const hostus = createHostus({ baseUrl: HOSTUS })
  const treffer = await hostus.suggest('Festuca ovina', { limit: 20, area: 'GER' })
  melde(treffer.length > 0, `hostus: ${treffer.length} Vorschläge`)

  // Der Kern der Anfrage: jeder Treffer trägt einen Euro+Med-Namen, denn
  // genau der geht später an habitatus. Ohne require_target_space kam
  // keiner — und die Liste zeigte dasselbe Taxon einmal je Referenzwerk.
  melde(treffer.every((t) => Boolean(t.name)), `hostus: alle ${treffer.length} Treffer mit Euro+Med-Namen`)
  const namen = new Set(treffer.map((t) => t.name))
  melde(namen.size === treffer.length, `hostus: keine gleichnamigen Vorschläge (${namen.size} Namen auf ${treffer.length} Treffer)`)
  melde(treffer.some((t) => t.inArea), `hostus: Gebietsbezug wirkt (${treffer.filter((t) => t.inArea).length} von ${treffer.length} für GER verzeichnet)`)
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
