// Zustand mit Abonnenten. Kennt weder DOM noch URL noch fetch — deshalb
// ohne Browser testbar, und deshalb kann jede Ansicht ihn benutzen, ohne
// etwas über die anderen zu wissen.
export function createStore(initial = {}) {
  let state = { ...initial }
  const subscribers = new Set()

  return {
    get: () => state,
    set(patchOrFn) {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn
      state = { ...state, ...patch }
      for (const fn of [...subscribers]) {
        // Ein fehlerhafter Abonnent darf die übrigen nicht mitreißen; sonst
        // hängt die halbe Oberfläche an einem Renderfehler in einer Ansicht.
        try {
          fn(state)
        } catch (err) {
          console.error('Abonnent hat geworfen:', err)
        }
      }
    },
    subscribe(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
  }
}
