// DOM-Anbindung des ARIA-Combobox-Patterns. Die Logik liegt in
// combobox-state.js und ist dort ohne Browser geprüft; hier kommen nur
// Ereignisse, Attribute und der Netzaufruf dazu.
import { createComboboxState, OPTION_ID_PREFIX } from '../combobox-state.js'
import { el, clear } from '../dom.js'

export function mountCombobox({ input, listbox, hostus, onPick, onError, debounceMs = 0 }) {
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
    onPick(gewaehlt ?? { name: input.value.trim(), conceptId: null, isEuroSl: false, entry: 'manual' })
    input.value = ''
    state.setQuery('')
    state.setOptions([])
    paint()
  }

  // debounceMs=0 statt einer spürbaren Verzögerung: der überholte Aufruf
  // wird ohnehin per AbortController abgebrochen, sobald der nächste
  // Anschlag kommt — eine zusätzliche Wartezeit brächte also keine
  // Ersparnis, würde aber Pfeiltasten und Enter kurz nach dem Tippen
  // regelmäßig ins Leere laufen lassen, weil die Vorschläge dann noch
  // nicht da sind. setTimeout(…, 0) reicht, um den Aufruf aus dem
  // synchronen Tastaturereignis herauszulösen.
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
