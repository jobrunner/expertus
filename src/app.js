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
import { clear, el } from './dom.js'
import { renderPlotList } from './views/plot-list.js'
import { renderPlotForm } from './views/plot-form.js'
import { renderSpeciesSection } from './views/species-section.js'

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

  // Die aktive Ansicht bleibt sonst am Store angemeldet: ohne Abmeldung
  // zeichnet eine längst verlassene Ansicht bei jeder Zustandsänderung
  // weiter in den gemeinsamen Einhängepunkt, unabhängig von der Route.
  let cleanupView = null

  const router = createRouter({
    window,
    onRoute(route) {
      cleanupView?.()
      cleanupView = null
      store.set({ route })
      clear(mount)
      if (route.name === 'list') cleanupView = renderPlotList({ mount, store, storage, actions, router })
      if (route.name === 'plot') {
        actions.openPlot(route.sampleId)
        // „Auswertung" (Task 17) ist hier noch nur ein Platzhalter mit
        // Überschrift, damit die Maske schon vier Abschnitte zeigt.
        cleanupView = renderPlotForm({
          mount, store, actions, router,
          sections: [
            (plot) => renderSpeciesSection({ plot, actions, hostus }),
            () => el('section', { 'aria-labelledby': 'h-ausw' }, [
              el('h3', { id: 'h-ausw', text: 'Auswertung' }),
              el('button', { type: 'button', text: 'Auswerten', disabled: true }),
              el('p', { class: 'muted', text: actions.blockingReason() ?? '' }),
            ]),
          ],
        })
      }
    },
  })

  store.set({ index: storage.list() })
  // Fehler werden nicht mehr hier global angesagt: jede Ansicht zeigt sie
  // selbst, sichtbar und mit role="alert" (siehe plot-form.js) — der
  // globale Live-Bereich hätte dieselbe Meldung sonst ein zweites Mal
  // angesagt. Ab Task 17 sagt diese Stelle stattdessen Auswertungsergebnisse
  // an; #meldungen (live) bleibt dafür bestehen.
  router.start()
} catch (err) {
  mount.append(Object.assign(document.createElement('p'), { className: 'warn', textContent: err.message }))
}
