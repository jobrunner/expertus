// Gemeinsamer Aufbau für die actions-*.test.js-Dateien: dieselbe Instanz
// von createActions() mit Store, Storage und stumm erfolgreichen
// ortus-/habitatus-Stubs, wie sie jeder Testfall braucht, der Aktionen
// ausführt statt einzelne Module isoliert zu testen.
import { createActions } from '../../src/actions.js'
import { createStore } from '../../src/store.js'
import { createStorage } from '../../src/storage.js'
import { createMemoryStorage } from './memory-storage.js'

export const HEADER = {
  Country: 'Germany', Coast_EEA: 'N_COAST', Dunes_Bohn: 'N_DUNES',
  Ecoreg: 654, 'Altitude (m)': 36, DEG_LAT: 52.52, DEG_LON: 13.405,
}
export const ORIGIN = Object.fromEntries(Object.keys(HEADER).map((k) => [k, 'ortus']))

export function setup({ ortus, habitatus } = {}) {
  const store = createStore({ plot: null, headerPending: false, evaluating: false, error: null })
  const storage = createStorage({ backend: createMemoryStorage(), now: () => '2026-09-14T10:00:00.000Z' })
  const actions = createActions({
    store,
    storage,
    ortus: ortus ?? { lookup: async () => ({ header: HEADER, origin: ORIGIN, evidence: {} }) },
    habitatus: habitatus ?? { classify: async () => ({ result: 'R1A', matches: [], resolution: [], versions: {}, truncatedAt10: false, request: {} }) },
    now: () => '2026-09-14T10:00:00.000Z',
  })
  return { store, storage, actions }
}
