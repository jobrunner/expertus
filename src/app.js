// Bootstrap: Konfiguration laden, Module verdrahten, Router starten.
// Die weiteren Ansichten kommen in den Tasks 15 bis 17 dazu.
import { loadConfig } from './config.js'
import { createStore } from './store.js'
import { createRouter } from './router.js'
import { createStorage } from './storage.js'
import { createOrtus } from './adapters/ortus.js'
import { createHostus } from './adapters/hostus.js'
import { createHabitatus } from './adapters/habitatus.js'
import { createActions } from './actions.js'
import { announce, clear } from './dom.js'
import { renderPlotList } from './views/plot-list.js'

const mount = document.getElementById('ansicht')
const live = document.getElementById('meldungen')

try {
  const config = await loadConfig()
  const store = createStore({ plot: null, headerPending: false, evaluating: false, error: null, index: [] })
  const storage = createStorage({ backend: window.localStorage })
  const actions = createActions({
    store,
    storage,
    ortus: createOrtus({ baseUrl: config.ortusBaseUrl }),
    habitatus: createHabitatus({ baseUrl: config.habitatusBaseUrl }),
  })
  const hostus = createHostus({ baseUrl: config.hostusBaseUrl })

  const router = createRouter({
    window,
    onRoute(route) {
      store.set({ route })
      clear(mount)
      if (route.name === 'list') renderPlotList({ mount, store, storage, actions, router })
    },
  })

  store.set({ index: storage.list() })
  store.subscribe((state) => {
    if (state.error) announce(live, state.error.message)
  })
  router.start()
} catch (err) {
  mount.append(Object.assign(document.createElement('p'), { className: 'warn', textContent: err.message }))
}
