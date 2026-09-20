// Prüft vor dem ersten Test, ob unter der Testadresse wirklich der für die
// Tests gestartete Server antwortet. Ohne diese Prüfung übernimmt Playwright
// bei reuseExistingServer einen fremden Server auf demselben Port — etwa
// einen von Hand gestarteten Entwicklungsserver. Der liefert dann eine CSP
// mit den echten Dienstadressen, während die Tests auf *.test stubben. Die
// Folge waren Fehlschläge in fast allen Spezifikationen, deren Ursache nicht
// erkennbar war: die Tests selbst sahen unverdächtig aus.
import { ERWARTETE_QUELLEN } from './stubs.js'

const VERSUCHE = 40
const ABSTAND_MS = 250

async function holeCSP(adresse) {
  const antwort = await fetch(adresse)
  return antwort.headers.get('content-security-policy') ?? ''
}

export default async function pruefeServer() {
  const adresse = `http://127.0.0.1:${process.env.E2E_PORT ?? '5174'}`
  let csp = ''
  for (let versuch = 0; versuch < VERSUCHE; versuch += 1) {
    try {
      csp = await holeCSP(adresse)
      break
    } catch {
      await new Promise((fertig) => setTimeout(fertig, ABSTAND_MS))
    }
  }
  if (!csp) {
    throw new Error(`Unter ${adresse} antwortet kein Server mit einer CSP.`)
  }
  const fehlend = ERWARTETE_QUELLEN.filter((quelle) => !csp.includes(quelle))
  if (fehlend.length > 0) {
    throw new Error(
      [
        `Der Server unter ${adresse} ist nicht der Testserver.`,
        `In seiner CSP fehlen: ${fehlend.join(', ')}`,
        'Vermutlich läuft dort ein von Hand gestarteter Server, den',
        'Playwright wegen reuseExistingServer übernommen hat. Beende ihn',
        'oder setze E2E_PORT auf einen freien Port.',
      ].join('\n'),
    )
  }
}
