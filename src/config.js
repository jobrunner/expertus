// Die Basis-URLs stehen nie im Quelltext: im Container erzeugt der
// Entrypoint config.json aus Umgebungsvariablen. Fehlt etwas, startet die
// App gar nicht erst — ein stiller Default würde gegen den falschen Dienst
// laufen, und das fiele erst am falschen Ergebnis auf.
const REQUIRED = ['ortusBaseUrl', 'habitatusBaseUrl', 'hostusBaseUrl']

export async function loadConfig({ fetch = globalThis.fetch } = {}) {
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`config.json nicht ladbar: HTTP ${res.status}`)
  const cfg = await res.json()
  const fehlend = REQUIRED.filter((k) => typeof cfg?.[k] !== 'string' || !cfg[k])
  if (fehlend.length) throw new Error(`config.json unvollständig: ${fehlend.join(', ')}`)
  return { ortusBaseUrl: cfg.ortusBaseUrl, habitatusBaseUrl: cfg.habitatusBaseUrl, hostusBaseUrl: cfg.hostusBaseUrl }
}
