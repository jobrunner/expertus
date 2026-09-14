// DOM-Anbindung des ARIA-Combobox-Patterns. Die Logik liegt in
// combobox-state.js und ist dort ohne Browser geprüft; hier kommen nur
// Ereignisse, Attribute und der Netzaufruf dazu.
import { createComboboxState, OPTION_ID_PREFIX } from '../combobox-state.js'
import { el, clear } from '../dom.js'

export function mountCombobox({ input, listbox, hostus, onPick, onError, debounceMs = 200 }) {
  const state = createComboboxState()
  let timer = null
  let laufend = null

  function paint() {
    const s = state.getState()
    input.setAttribute('aria-expanded', String(s.open))
    if (s.activeId) input.setAttribute('aria-activedescendant', s.activeId)
    else input.removeAttribute('aria-activedescendant')

    clear(listbox)
    listbox.hidden = !s.open
    if (!s.open) return
    s.options.forEach((o, i) =>
      listbox.append(
        el('li', {
          id: `${OPTION_ID_PREFIX}${i}`,
          role: 'option',
          class: 'option',
          'aria-selected': String(i === s.activeIndex),
          onMousedown: (e) => {
            // mousedown statt click: click käme nach blur, und blur schließt.
            e.preventDefault()
            state.select(i)
            uebernehmen()
          },
        }, [o.name, o.isEuroSl ? null : el('span', { class: 'muted', text: ' — nicht Euro+Med' })]),
      ),
    )
  }

  function uebernehmen() {
    const gewaehlt = state.pick()
    // Ohne Markierung gilt der Freitext: ESy-Konventionen wie
    // "Quercus species" kennt kein Backbone.
    const gewaehlteArt = gewaehlt ?? { name: input.value.trim(), conceptId: null, isEuroSl: false, entry: 'manual' }
    // Erst leeren, dann erst onPick auslösen: onPick stößt über actions.
    // addSpecies synchron einen Neuaufbau der Maske an, und preserveFocus
    // (dom.js) nimmt den zu diesem Zeitpunkt sichtbaren Feldwert mit
    // hinüber, damit ein unbeteiligter Neuaufbau (siehe dort) nichts
    // verwirft. Stünde hier noch der übernommene Artname, käme er nach der
    // Auswahl unerwünscht zurück.
    input.value = ''
    state.setQuery('')
    state.setOptions([])
    paint()
    onPick(gewaehlteArt)
  }

  // Die Entprellung ist hier nicht verhandelbar: ohne sie löst jeder
  // einzelne Tastenanschlag sofort eine eigene Netzanfrage aus — bei
  // "Festuca ovina" wären das dreizehn statt ein bis zwei. Der
  // AbortController verhindert nur, dass eine überholte ANTWORT noch
  // verarbeitet wird; er verhindert nicht, dass die ANFRAGE überhaupt
  // gestellt wird. Die Anwendung läuft im Gelände über Mobilfunk — dort
  // zählen Datenvolumen, Akku und Wartezeit.
  input.addEventListener('input', () => {
    state.setQuery(input.value)
    clearTimeout(timer)
    timer = setTimeout(async () => {
      laufend?.abort()
      laufend = new AbortController()
      try {
        state.setOptions(await hostus.suggest(input.value, { signal: laufend.signal }))
        paint()
      } catch (err) {
        if (err?.name === 'AbortError') return
        state.setOptions([])
        paint()
        onError?.(err)
      }
    }, debounceMs)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); state.move(1); paint() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.move(-1); paint() }
    else if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) uebernehmen() }
    else if (e.key === 'Escape') { clearTimeout(timer); laufend?.abort(); state.close(); paint() }
  })

  input.addEventListener('blur', () => { state.close(); paint() })

  paint()
  return { destroy: () => { clearTimeout(timer); laufend?.abort() } }
}
