// Eine Fehlerklasse für alle drei Adapter. Die Unterscheidung nach kind ist
// das, was die Oberfläche braucht: 'request' ist ein Eingabefehler und wird
// am Feld angezeigt, 'service' ist nicht die Schuld des Nutzers, 'network'
// ist wiederholbar.
export class ServiceError extends Error {
  constructor(message, { kind, service, status = null }) {
    super(message)
    this.name = 'ServiceError'
    this.kind = kind
    this.service = service
    this.status = status
    this.retryable = kind === 'network' || kind === 'service'
  }
}

// Abbrüche werden nie in ServiceError verwandelt: sie sind kein Fehler,
// sondern der Normalfall beim Tippen im Autosuggest.
export function rethrowAbort(err) {
  if (err?.name === 'AbortError') throw err
}

export async function readError(res, service) {
  let detail = ''
  try {
    const body = await res.json()
    detail = typeof body?.error === 'string' ? body.error : JSON.stringify(body)
  } catch {
    detail = `HTTP ${res.status}`
  }
  const kind = res.status >= 400 && res.status < 500 ? 'request' : 'service'
  return new ServiceError(detail, { kind, service, status: res.status })
}
