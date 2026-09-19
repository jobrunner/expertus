import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOrtus } from '../../src/adapters/ortus.js'
import { ServiceError } from '../../src/adapters/errors.js'
import { createFakeFetch } from '../helpers/fake-fetch.js'
import { loadFixture } from '../helpers/fixtures.js'

const BASE = 'https://ortus.example.org'

test('WGS 84 landet als lon und lat in der Anfrage', async () => {
  const calls = []
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ json: loadFixture('berlin') }, calls) })
  await ortus.lookup({ system: '4326', x: 13.405, y: 52.52 })
  assert.equal(calls[0].url, `${BASE}/api/v1/query?lon=13.405&lat=52.52`)
})

// Aufgabe 12: Expertus reicht ein anderes System als srid/x/y an ortus
// weiter, statt die Rohwerte fälschlich als WGS-84-Grad zu verschicken.
test('ein projiziertes System landet als srid, x und y in der Anfrage', async () => {
  const calls = []
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ json: loadFixture('berlin') }, calls) })
  await ortus.lookup({ system: '25832', x: 389524, y: 5820270 })
  assert.equal(calls[0].url, `${BASE}/api/v1/query?srid=25832&x=389524&y=5820270`)
})

test('MGRS landet als eigener Parameter, ohne srid', async () => {
  const calls = []
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ json: loadFixture('berlin') }, calls) })
  await ortus.lookup({ system: 'mgrs', text: '33UUU9449865648' })
  assert.equal(calls[0].url, `${BASE}/api/v1/query?mgrs=33UUU9449865648`)
})

test('der Adapter gibt Kopfdaten und die reprojizierte Koordinate heraus, nicht die ortus-Antwort', async () => {
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ json: loadFixture('berlin') }) })
  const out = await ortus.lookup({ system: '4326', x: 13.405, y: 52.52 })
  assert.deepEqual(Object.keys(out).sort(), ['coordinate', 'evidence', 'header', 'origin'])
  assert.equal(out.header.Country, 'Germany')
  assert.deepEqual(out.coordinate, { lat: 52.52, lon: 13.405 })
  assert.equal('results' in out, false)
})

test('ein abschließender Schrägstrich in der Basis-URL verdoppelt sich nicht', async () => {
  const calls = []
  const ortus = createOrtus({ baseUrl: `${BASE}/`, fetch: createFakeFetch({ json: loadFixture('berlin') }, calls) })
  await ortus.lookup({ system: '4326', x: 13.405, y: 52.52 })
  assert.equal(calls[0].url.includes('//api'), false)
})

test('4xx ist ein Anfragefehler', async () => {
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ status: 400, json: { error: 'lat fehlt' } }) })
  await assert.rejects(() => ortus.lookup({ system: '4326', x: 13.405, y: 52.52 }), (err) => {
    assert.ok(err instanceof ServiceError)
    assert.equal(err.kind, 'request')
    assert.equal(err.service, 'ortus')
    assert.match(err.message, /lat fehlt/)
    return true
  })
})

test('5xx ist ein Dienstfehler, nicht die Schuld des Nutzers', async () => {
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ status: 503, text: 'upstream down' }) })
  await assert.rejects(() => ortus.lookup({ system: '4326', x: 1, y: 1 }), (err) => {
    assert.equal(err.kind, 'service')
    return true
  })
})

test('ein Netzfehler ist als wiederholbar gekennzeichnet', async () => {
  const ortus = createOrtus({ baseUrl: BASE, fetch: () => Promise.reject(new TypeError('Failed to fetch')) })
  await assert.rejects(() => ortus.lookup({ system: '4326', x: 1, y: 1 }), (err) => {
    assert.equal(err.kind, 'network')
    assert.equal(err.retryable, true)
    return true
  })
})

test('ein Abbruch bleibt ein AbortError und wird nicht umetikettiert', async () => {
  // Die Ansicht verwirft Abbrüche stillschweigend; würde der Adapter daraus
  // einen Netzfehler machen, erschiene bei jeder überholten Anfrage eine
  // Fehlermeldung.
  const ortus = createOrtus({
    baseUrl: BASE,
    fetch: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
  })
  await assert.rejects(() => ortus.lookup({ system: '4326', x: 1, y: 1 }), (err) => {
    assert.equal(err.name, 'AbortError')
    return true
  })
})

test('das Abbruchsignal wird durchgereicht', async () => {
  const calls = []
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ json: loadFixture('berlin') }, calls) })
  const controller = new AbortController()
  await ortus.lookup({ system: '4326', x: 1, y: 1, signal: controller.signal })
  assert.equal(calls[0].options.signal, controller.signal)
})

test('unlesbares JSON ist ein Dienstfehler', async () => {
  const ortus = createOrtus({ baseUrl: BASE, fetch: createFakeFetch({ status: 200, text: 'kein json' }) })
  await assert.rejects(() => ortus.lookup({ system: '4326', x: 1, y: 1 }), (err) => {
    assert.equal(err.kind, 'service')
    return true
  })
})
