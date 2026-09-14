import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../src/store.js'

test('get liefert den Anfangszustand', () => {
  assert.deepEqual(createStore({ a: 1 }).get(), { a: 1 })
})

test('set mischt ein Teilobjekt ein', () => {
  const s = createStore({ a: 1, b: 2 })
  s.set({ b: 3 })
  assert.deepEqual(s.get(), { a: 1, b: 3 })
})

test('set nimmt auch eine Funktion des alten Zustands', () => {
  const s = createStore({ n: 1 })
  s.set((prev) => ({ n: prev.n + 1 }))
  assert.equal(s.get().n, 2)
})

test('Abonnenten werden nach der Änderung benachrichtigt', () => {
  const s = createStore({ a: 1 })
  const gesehen = []
  s.subscribe((state) => gesehen.push(state.a))
  s.set({ a: 2 })
  assert.deepEqual(gesehen, [2])
})

test('subscribe ruft nicht sofort', () => {
  // Sonst rendert jede Ansicht einmal gegen einen Zustand, den sie schon
  // beim Aufbau gelesen hat.
  const s = createStore({ a: 1 })
  let rufe = 0
  s.subscribe(() => rufe++)
  assert.equal(rufe, 0)
})

test('die Abmeldefunktion beendet die Benachrichtigung', () => {
  const s = createStore({ a: 1 })
  let rufe = 0
  const off = s.subscribe(() => rufe++)
  off()
  s.set({ a: 2 })
  assert.equal(rufe, 0)
})

test('der Zustand wird ersetzt, nicht mutiert', () => {
  const s = createStore({ a: 1 })
  const vorher = s.get()
  s.set({ a: 2 })
  assert.equal(vorher.a, 1)
})

test('ein fehlerhafter Abonnent bringt die übrigen nicht um', () => {
  const s = createStore({ a: 1 })
  let zweiter = 0
  s.subscribe(() => {
    throw new Error('kaputt')
  })
  s.subscribe(() => zweiter++)
  s.set({ a: 2 })
  assert.equal(zweiter, 1)
})
