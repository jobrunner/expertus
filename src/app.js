// Bootstrap: Konfiguration laden, Module verdrahten, Router starten.
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
import { missingFields } from './header-map.js'
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
  // Wahr, solange ein bereits gespeicherter Plot nur geöffnet wird: sein
  // Ergebnis ist alt und darf nicht so klingen, als wäre es gerade
  // entstanden.
  let stumm = false

  const router = createRouter({
    window,
    onRoute(route) {
      // Nur ein echter Wechsel verwaist ein fokussiertes Element der
      // vorigen Ansicht. Beim allerersten Aufruf (Seitenaufbau) gibt es
      // weder eine Vorgänger-Ansicht noch besteht die Race-Gefahr unten —
      // die Zurücksetzung hier würde dort nur unnötig mit dem allerersten
      // Tab-Druck der Nutzerin um den Fokus konkurrieren.
      const wechsel = cleanupView !== null
      cleanupView?.()
      cleanupView = null
      clear(mount)
      if (route.name === 'list') cleanupView = renderPlotList({ mount, store, storage, actions, router })
      if (route.name === 'plot') {
        // Ein gespeichertes Ergebnis ist beim Öffnen nicht gerade
        // entstanden: angesagt wird nur, was jetzt passiert.
        stumm = true
        actions.openPlot(route.sampleId)
        stumm = false
        cleanupView = renderPlotForm({
          mount, store, actions, router,
          sections: [
            (plot) => renderSpeciesSection({ plot, actions, hostus }),
            (plot) => renderResultSection({ plot, actions, store }),
          ],
        })
      }
      if (wechsel) {
        // clear() entfernt das gerade fokussierte Element der alten
        // Ansicht; der Browser springt daraufhin zwar auf document.body,
        // merkt sich aber intern noch dessen Baumposition — ein Tab landete
        // sonst mitten in der neuen Ansicht und würde Kopfzeile samt
        // Navigation überspringen. Der explizite Fokus setzt auch diesen
        // internen Ausgangspunkt zurück, sodass Tab wieder beim Sprunglink
        // beginnt.
        document.body.setAttribute('tabindex', '-1')
        document.body.focus()
        document.body.removeAttribute('tabindex')
      }
    },
  })

  store.set({ index: storage.list() })
  // Fehler werden nicht hier angesagt: jede Ansicht zeigt sie selbst,
  // sichtbar und mit role="alert" (siehe plot-form.js) — der globale
  // Live-Bereich würde dieselbe Meldung sonst ein zweites Mal ansagen.
  // Angesagt werden hier die beiden Statuswechsel, die sonst nirgends
  // hörbar sind: das Ende des Kopfdaten-Abrufs und das Auswertungsergebnis.
  let letzteAnsage = null
  let warPending = false
  store.subscribe((state) => {
    // Kopfdaten geladen: ohne diese Ansage merkt man den Abschluss nur
    // daran, dass der Auswerten-Knopf irgendwann nicht mehr gesperrt ist —
    // wer nicht sieht, erfährt ihn gar nicht. Der Text sagt gleich mit, ob
    // Felder fehlen; ein Fehlschlag bleibt der Fehlermeldung überlassen.
    if (warPending && !state.headerPending) {
      warPending = false
      if (!state.error) {
        const fehlend = missingFields(state.plot?.headerOrigin ?? {})
        announce(live, fehlend.length
          ? `Kopfdaten geladen, ${fehlend.length} Feld(er) fehlen: ${fehlend.join(', ')}`
          : 'Kopfdaten geladen, alle Felder vorhanden.')
      }
    }
    if (state.headerPending) warPending = true

    const ev = state.plot?.evaluation
    if (ev?.status !== 'ok') return
    // Ohne diese Wächterbedingung würde jede unverwandte Zustandsänderung
    // (z. B. das Ein-/Ausblenden von "Kopfdaten werden geholt …") dieselbe
    // Meldung erneut vorlesen, solange keine neue Auswertung stattfand.
    if (ev === letzteAnsage) return
    letzteAnsage = ev
    if (stumm) return
    announce(live, `Ergebnis: ${resultLabel(ev.response.result)}`)
  })
  router.start()
} catch (err) {
  mount.append(Object.assign(document.createElement('p'), { className: 'warn', textContent: err.message }))
}
