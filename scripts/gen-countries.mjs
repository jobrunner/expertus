#!/usr/bin/env node
// Erzeugt src/esy-countries.js aus habitatus/data/esy-country-names.csv.
// Die CSV ist dort die Quelle der Wahrheit (52 Zeilen, gegen den
// ESy-User-Guide geprüft). Hier wird sie nur übersetzt, nie ergänzt.
import { writeFileSync } from 'node:fs'

const URL_CSV =
  'https://raw.githubusercontent.com/jobrunner/habitatus/main/data/esy-country-names.csv'

const text = await (await fetch(URL_CSV)).text()
const rows = text.trim().split('\n').slice(1)

const pairs = rows.map((line, i) => {
  const [iso, name] = line.split(',')
  if (!iso?.trim() || !name?.trim()) throw new Error(`Zeile ${i + 2} unvollständig: ${line}`)
  return [iso.trim().toUpperCase(), name.trim()]
})

if (pairs.length !== 52) throw new Error(`Erwartet 52 Länder, gelesen ${pairs.length}`)

const body = pairs.map(([iso, name]) => `  ${iso}: ${JSON.stringify(name)},`).join('\n')

writeFileSync(
  new URL('../src/esy-countries.js', import.meta.url),
  `// ERZEUGT von scripts/gen-countries.mjs — nicht von Hand bearbeiten.
// Quelle: habitatus/data/esy-country-names.csv (52 Zeilen).
//
// Habitatus vergleicht Country als exakte Zeichenkette. "Germany", nicht
// "Deutschland", nicht "DE"; "Czech Republic", nicht "Czechia". Jede
// Abweichung lässt die zugehörigen Regeln stumm nie wahr werden.

export const ESY_COUNTRIES = {
${body}
}

export const ESY_COUNTRY_NAMES = Object.values(ESY_COUNTRIES).sort()

export function esyCountryFor(iso) {
  if (typeof iso !== 'string' || iso === '') return null
  return ESY_COUNTRIES[iso.toUpperCase()] ?? null
}
`,
)

console.log(`src/esy-countries.js geschrieben, ${pairs.length} Länder`)
