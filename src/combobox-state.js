// Auswahl- und Öffnungslogik der Autosuggest-Liste, ohne DOM.
//
// Hier liegt sie, damit sie ohne Browser prüfbar ist: das ARIA-Combobox-
// Pattern hat genug Zustand (offen, aktiver Index, activedescendant), um
// still falsch zu sein, und axe sieht davon nur die Attribute.

export const OPTION_ID_PREFIX = 'legulus-option-'

export function createComboboxState() {
  let query = ''
  let options = []
  let open = false
  let activeIndex = -1

  function state() {
    return {
      query,
      options,
      open,
      activeIndex,
      activeId: activeIndex >= 0 ? `${OPTION_ID_PREFIX}${activeIndex}` : null,
    }
  }

  return {
    getState: state,

    setOptions(list) {
      options = list ?? []
      open = options.length > 0
      activeIndex = -1
    },

    setQuery(q) {
      query = q
      activeIndex = -1
    },

    close() {
      open = false
      activeIndex = -1
    },

    move(delta) {
      if (!open || options.length === 0) return
      const n = options.length
      activeIndex = activeIndex < 0 ? (delta > 0 ? 0 : n - 1) : (activeIndex + delta + n) % n
    },

    select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= options.length) return
      activeIndex = index
    },

    pick() {
      if (activeIndex < 0) return null
      const chosen = options[activeIndex]
      open = false
      activeIndex = -1
      return chosen
    },
  }
}
