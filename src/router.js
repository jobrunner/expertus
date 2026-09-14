// Hash-Routen. Zwei Routen genügen: die Liste und ein Plot. Das Ergebnis
// bekommt bewusst keine eigene Route — es steht unter der Maske, damit
// Nachjustieren ein Knopfdruck bleibt und keine Navigation.

export function parseRoute(hash) {
  const path = String(hash ?? '').replace(/^#/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'plot' && parts[1]) {
    return { name: 'plot', sampleId: decodeURIComponent(parts.slice(1).join('/')) }
  }
  return { name: 'list' }
}

export function hashFor(route) {
  if (route?.name === 'plot' && route.sampleId) {
    return `#/plot/${encodeURIComponent(route.sampleId)}`
  }
  return '#/plots'
}

export function createRouter({ window, onRoute }) {
  // Ein Klick ruft go() auf und erwartet die neue Ansicht sofort — das
  // hashchange-Ereignis feuert aber asynchron (ein eigener Task). Bis dahin
  // bliebe die alte Ansicht noch erreichbar, mitsamt ihrer fokussierbaren
  // Elemente: ein sofortiger zweiter Tab-Druck landet dann in der falschen
  // Ansicht (siehe e2e/a11y.spec.js, „Fokusreihenfolge“). process() wird
  // deshalb synchron aus go() aufgerufen; currentHash verhindert, dass das
  // nachträgliche hashchange-Ereignis dieselbe Route ein zweites Mal meldet.
  let currentHash = null
  function process(hash) {
    if (hash === currentHash) return
    currentHash = hash
    onRoute(parseRoute(hash))
  }
  const handle = () => process(window.location.hash)
  return {
    start() {
      window.addEventListener('hashchange', handle)
      handle()
    },
    stop() {
      window.removeEventListener('hashchange', handle)
    },
    go(route) {
      const hash = hashFor(route)
      window.location.hash = hash
      process(hash)
    },
  }
}
