// Ersatz für window.localStorage in node:test. Bildet nur nach, was
// storage.js benutzt, und speichert bewusst nur Strings — echtes
// localStorage tut das auch, und ein Fake, der Objekte durchreicht,
// würde fehlende JSON.stringify-Aufrufe verdecken.
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
    key(i) {
      return [...map.keys()][i] ?? null
    },
    get length() {
      return map.size
    },
  }
}
