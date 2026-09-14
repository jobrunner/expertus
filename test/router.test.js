import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, hashFor, createRouter } from '../src/router.js'

test('die leere Route ist die Liste', () => {
  assert.deepEqual(parseRoute(''), { name: 'list' })
  assert.deepEqual(parseRoute('#/'), { name: 'list' })
  assert.deepEqual(parseRoute('#/plots'), { name: 'list' })
})

test('eine Plot-Route trägt ihre Sample-ID', () => {
  assert.deepEqual(parseRoute('#/plot/Sylt-03'), { name: 'plot', sampleId: 'Sylt-03' })
})

test('Sonderzeichen in der Sample-ID überleben den Weg durch die URL', () => {
  const id = 'Düne/Nord 7'
  assert.deepEqual(parseRoute(hashFor({ name: 'plot', sampleId: id })), { name: 'plot', sampleId: id })
})

test('eine unbekannte Route fällt auf die Liste zurück', () => {
  assert.deepEqual(parseRoute('#/gibtsnicht'), { name: 'list' })
})

test('#/plot ohne ID ist die Liste, kein Plot mit leerem Namen', () => {
  assert.deepEqual(parseRoute('#/plot/'), { name: 'list' })
})

test('der Router meldet die Route beim Start und bei jedem hashchange', () => {
  const fakeWindow = fakeWin('#/plots')
  const gesehen = []
  const router = createRouter({ window: fakeWindow, onRoute: (r) => gesehen.push(r) })
  router.start()
  fakeWindow.location.hash = '#/plot/P-1'
  fakeWindow.dispatch('hashchange')
  assert.deepEqual(gesehen, [{ name: 'list' }, { name: 'plot', sampleId: 'P-1' }])
})

test('go setzt den Hash und löst damit die Navigation aus', () => {
  const fakeWindow = fakeWin('#/plots')
  const router = createRouter({ window: fakeWindow, onRoute: () => {} })
  router.start()
  router.go({ name: 'plot', sampleId: 'P-1' })
  assert.equal(fakeWindow.location.hash, '#/plot/P-1')
})

test('stop meldet den Zuhörer ab', () => {
  const fakeWindow = fakeWin('#/plots')
  const gesehen = []
  const router = createRouter({ window: fakeWindow, onRoute: (r) => gesehen.push(r) })
  router.start()
  router.stop()
  fakeWindow.location.hash = '#/plot/P-1'
  fakeWindow.dispatch('hashchange')
  assert.equal(gesehen.length, 1)
})

function fakeWin(hash) {
  const listeners = {}
  return {
    location: { hash },
    addEventListener: (type, fn) => ((listeners[type] ??= []).push(fn)),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)
    },
    dispatch: (type) => (listeners[type] ?? []).forEach((fn) => fn()),
  }
}
