#!/usr/bin/env node
// Holt echte ortus-Antworten und friert sie unter testdata/ortus/ ein.
// Die Tests laufen danach ohne Netz. Erneut ausführen, wenn sich das
// Antwortformat von ortus ändert — der Diff zeigt dann, was sich bewegt hat.
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ORTUS_BASE_URL ?? 'https://ortus.fieldworksdiary.org'

const POINTS = {
  berlin: { lon: 13.405, lat: 52.52 },
  sylt: { lon: 8.31, lat: 54.9 },
  'ostsee-darss': { lon: 12.45, lat: 54.45 },
  'tel-aviv': { lon: 34.78, lat: 32.08 },
  'new-york': { lon: -74.006, lat: 40.713 },
}

const dir = new URL('../testdata/ortus/', import.meta.url)
mkdirSync(dir, { recursive: true })

for (const [name, { lon, lat }] of Object.entries(POINTS)) {
  const res = await fetch(`${BASE}/api/v1/query?lon=${lon}&lat=${lat}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const body = await res.json()
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(body, null, 2) + '\n')
  console.log(`${name}.json geschrieben`)
}
