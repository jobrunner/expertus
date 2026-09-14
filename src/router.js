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
  const handle = () => onRoute(parseRoute(window.location.hash))
  return {
    start() {
      window.addEventListener('hashchange', handle)
      handle()
    },
    stop() {
      window.removeEventListener('hashchange', handle)
    },
    go(route) {
      window.location.hash = hashFor(route)
    },
  }
}
