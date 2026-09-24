// Die Basis-URLs stehen nie im Quelltext: im Container erzeugt der
// Entrypoint config.json aus Umgebungsvariablen. Fehlt etwas, startet die
// App gar nicht erst — ein stiller Default würde gegen den falschen Dienst
// laufen, und das fiele erst am falschen Ergebnis auf.
const REQUIRED = ['ortusBaseUrl', 'habitatusBaseUrl', 'hostusBaseUrl']

// situs ist als einziger Dienst freiwillig: ohne ihn fehlen nur die
// Angaben zum erkannten Habitattyp, erfassen und auswerten geht weiter.
// Der Server lässt die Adresse aus /config.json heraus, wenn
// SITUS_BASE_URL nicht gesetzt ist — ein leerer Wert hier bedeutet also
// "nicht eingerichtet", nicht "kaputt konfiguriert".
const OPTIONAL = ['situsBaseUrl']

export async function loadConfig({ fetch = globalThis.fetch } = {}) {
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`config.json nicht ladbar: HTTP ${res.status}`)
  // res.json() liefert bei kaputtem JSON nur den rohen Parserfehler
  // (z.B. "Expected property name..."); der nennt weder Datei noch Ursache.
  // Für den Betreiber, der gerade einen Container mit fehlerhafter
  // Konfiguration gestartet hat, wird die Meldung deshalb hier präzisiert.
  let cfg
  try {
    cfg = await res.json()
  } catch (err) {
    throw new Error(`config.json ist kein gültiges JSON: ${err.message}`, { cause: err })
  }
  const fehlend = REQUIRED.filter((k) => typeof cfg?.[k] !== 'string' || !cfg[k])
  if (fehlend.length) throw new Error(`config.json unvollständig: ${fehlend.join(', ')}`)
  const aus = Object.fromEntries(REQUIRED.map((k) => [k, cfg[k]]))
  for (const k of OPTIONAL) aus[k] = typeof cfg?.[k] === 'string' ? cfg[k] : ''
  return aus
}
