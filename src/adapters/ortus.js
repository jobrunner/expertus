// ortus: Koordinate → Standort-Kopfdaten.
//
// Dieser Adapter ist die einzige Stelle im Frontend, die eine ortus-Antwort
// zu Gesicht bekommt; nach außen gibt er nur das interne Kopfdatenformat.
import { deriveHeader } from '../header-map.js'
import { ServiceError, readError, rethrowAbort } from './errors.js'

export function createOrtus({ baseUrl, fetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '')

  return {
    async lookup({ lat, lon, signal }) {
      const url = `${base}/api/v1/query?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}`
      let res
      try {
        res = await fetch(url, { signal })
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`ortus ist nicht erreichbar: ${err.message}`, {
          kind: 'network',
          service: 'ortus',
        })
      }
      if (!res.ok) throw await readError(res, 'ortus')
      try {
        return deriveHeader(await res.json())
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`Antwort von ortus nicht lesbar: ${err.message}`, {
          kind: 'service',
          service: 'ortus',
        })
      }
    },
  }
}
