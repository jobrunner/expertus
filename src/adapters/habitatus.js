// habitatus: Plot → EUNIS-Habitat.
import { HEADER_FIELDS } from '../header-map.js'
import { ServiceError, readError, rethrowAbort } from './errors.js'

export class IncompleteHeaderError extends Error {
  constructor(fields) {
    super(`Kopfdaten unvollständig: ${fields.join(', ')}`)
    this.name = 'IncompleteHeaderError'
    this.fields = fields
  }
}

// Der Request wird Feld für Feld aufgebaut, nie aus dem Plot durchgereicht:
// habitatus dekodiert mit DisallowUnknownFields und beantwortet jedes
// zusätzliche Feld mit 400.
export function buildRequest({ header, species, sampleId }) {
  const missing = HEADER_FIELDS.filter((f) => header?.[f] === null || header?.[f] === undefined)
  if (missing.length) throw new IncompleteHeaderError(missing)

  if (!species?.length) throw new Error('Die Artenliste ist leer.')
  for (const s of species) {
    if (!(typeof s.cover === 'number' && Number.isFinite(s.cover) && s.cover > 0 && s.cover <= 100)) {
      throw new Error(`Deckung von "${s.name}" liegt nicht zwischen 0 und 100: ${s.cover}`)
    }
  }

  const out = {}
  for (const f of HEADER_FIELDS) out[f] = String(header[f])
  if (sampleId) out.Dataset = String(sampleId)

  return {
    backbone: 'euro+med',
    records: species.map((s) => ({ name: s.name, cover: s.cover })),
    header: out,
  }
}

export function createHabitatus({ baseUrl, fetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '')

  return {
    async classify({ header, species, sampleId, signal }) {
      const request = buildRequest({ header, species, sampleId })
      let res
      try {
        res = await fetch(`${base}/api/v1/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal,
        })
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`habitatus ist nicht erreichbar: ${err.message}`, {
          kind: 'network',
          service: 'habitatus',
        })
      }
      if (!res.ok) throw await readError(res, 'habitatus')

      let body
      try {
        body = await res.json()
      } catch (err) {
        rethrowAbort(err)
        throw new ServiceError(`Antwort von habitatus nicht lesbar: ${err.message}`, {
          kind: 'service',
          service: 'habitatus',
        })
      }

      return {
        result: body.result,
        matches: body.matches ?? [],
        resolution: (body.resolution ?? []).map((s) => ({
          input: s.input,
          afterBackbone: s.after_backbone,
          final: s.final,
          resolved: s.resolved,
        })),
        versions: body.versions ?? {},
        truncatedAt10: body.truncated_at_10 ?? false,
        request,
      }
    },
  }
}
