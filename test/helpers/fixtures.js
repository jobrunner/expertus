import { readFileSync } from 'node:fs'

// Lädt eine eingefrorene ortus-Antwort. Wirft bei unbekanntem Namen, statt
// undefined zurückzugeben: ein Tippfehler im Fixture-Namen soll den Test
// zum Scheitern bringen, nicht stillschweigend gegen ein leeres Objekt prüfen.
export function loadFixture(name) {
  const url = new URL(`../../testdata/ortus/${name}.json`, import.meta.url)
  try {
    return JSON.parse(readFileSync(url, 'utf8'))
  } catch (cause) {
    throw new Error(`Fixture ${name} nicht lesbar: ${cause.message}`, { cause })
  }
}
