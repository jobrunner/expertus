// ortus: Koordinate → Standort-Kopfdaten.
//
// Dieser Adapter ist die einzige Stelle im Frontend, die eine ortus-Antwort
// zu Gesicht bekommt; nach außen gibt er nur das interne Kopfdatenformat.
import { deriveHeader } from '../header-map.js'
import { ServiceError, readError, rethrowAbort } from './errors.js'

export function createOrtus({ baseUrl, fetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '')

  return {
    // system ist die EPSG-Kennung als Zeichenkette oder 'mgrs'; x/y sind bei
    // WGS 84 bereits Lon/Lat, bei den übrigen Systemen Rechts-/Hochwert —
    // dieselbe Zuordnung wie im Bedienformular (Aufgabe 12) und bei Ortus
    // selbst. Ortus transformiert serverseitig und liefert in jeder Antwort
    // zusätzlich einen "wgs84"-Block mit der umgerechneten Gradkoordinate;
    // ihn gibt lookup() als `coordinate` weiter, damit Expertus einen Fundort
    // auch bei einer Eingabe in Gauß-Krüger, UTM & Co. an der richtigen
    // Stelle speichert und nicht die Rohwerte für WGS-84-Grad hält.
    async lookup({ system = '4326', x, y, text, signal }) {
      const url = `${base}/api/v1/query?${queryString({ system, x, y, text })}`
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
        const doc = await res.json()
        return { ...deriveHeader(doc), coordinate: wgs84Of(doc) }
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

// MGRS trägt seine SRID im Text selbst (die UTM-Zone, die es dekodiert) —
// deshalb kein srid-Parameter dafür. Für WGS 84 reichen lon/lat, wie Ortus'
// eigene Konsole es tut; alle anderen Systeme brauchen x/y plus srid, damit
// ortus weiß, in welchem System die Zahlen stehen und wie es sie umrechnet.
function queryString({ system, x, y, text }) {
  if (system === 'mgrs') return `mgrs=${encodeURIComponent(text ?? '')}`
  if (system === '4326') return `lon=${encodeURIComponent(x)}&lat=${encodeURIComponent(y)}`
  return `srid=${encodeURIComponent(system)}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`
}

// Der "wgs84"-Block ist die von ortus reprojizierte Gradkoordinate und
// begleitet jede Antwort, bei der die Umrechnung gelingt. Fehlt er (etwa bei
// einem Fehler in der Reprojektion), bleibt die Gradkoordinate nur dann
// bekannt, wenn ohnehin in WGS 84 gefragt wurde — sonst wäre eine geratene
// Umrechnung schlimmer als ein fehlender Wert.
function wgs84Of(doc) {
  if (doc.wgs84) return { lat: doc.wgs84.lat, lon: doc.wgs84.lon }
  if (doc.coordinate?.srid === 4326) return { lat: doc.coordinate.y, lon: doc.coordinate.x }
  return null
}
