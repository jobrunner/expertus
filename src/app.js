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
import { clear, announce } from './dom.js'
import { resultLabel } from './format.js'
import { renderPlotList } from './views/plot-list.js'
import { renderPlotForm } from './views/plot-form.js'
import { renderSpeciesSection } from './views/species-section.js'
import { renderResultSection } from './views/result.js'

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
        cleanupView = renderPlotForm({
          mount, store, actions, router,
          sections: [
            (plot) => renderSpeciesSection({ plot, actions, hostus }),
            (plot) => renderResultSection({ plot, actions, store }),
          ],
        })
      }
    },
  })

  store.set({ index: storage.list() })
  // Fehler werden nicht hier angesagt: jede Ansicht zeigt sie selbst,
  // sichtbar und mit role="alert" (siehe plot-form.js) —
  // der globale Live-Bereich würde dieselbe Meldung sonst ein zweites Mal
  // ansagen (Entscheidung aus Task 15). Angesagt wird hier ausschließlich
  // das Auswertungsergebnis: es steht nirgends sonst mit role="alert" oder
  // -status, wäre also ohne diese Stelle für Screenreader stumm.
  let letzteAnsage = null
  store.subscribe((state) => {
    const ev = state.plot?.evaluation
    if (ev?.status !== 'ok') return
    // Ohne diese Wächterbedingung würde jede unverwandte Zustandsänderung
    // (z. B. das Ein-/Ausblenden von "Kopfdaten werden geholt …") dieselbe
    // Meldung erneut vorlesen, solange keine neue Auswertung stattfand.
    if (ev === letzteAnsage) return
    letzteAnsage = ev
    announce(live, `Ergebnis: ${resultLabel(ev.response.result)}`)
  })
  router.start()
} catch (err) {
  mount.append(Object.assign(document.createElement('p'), { className: 'warn', textContent: err.message }))
}
