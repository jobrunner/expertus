import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'
import { createFakeFetch } from './helpers/fake-fetch.js'

const VOLL = {
  ortusBaseUrl: 'https://ortus.example.org',
  habitatusBaseUrl: 'https://habitatus.example.org',
  hostusBaseUrl: 'https://hostus.example.org',
}

test('die drei Basis-URLs werden gelesen', async () => {
  assert.deepEqual(await loadConfig({ fetch: createFakeFetch({ json: VOLL }) }), VOLL)
})

test('config.json wird ohne Cache geholt', async () => {
  // Sonst zeigt ein Neustart des Containers mit geänderter Konfiguration
  // im Browser weiter auf die alten Dienste.
  const calls = []
  await loadConfig({ fetch: createFakeFetch({ json: VOLL }, calls) })
  assert.equal(calls[0].url, '/config.json')
  assert.equal(calls[0].options.cache, 'no-store')
})

test('eine fehlende Basis-URL ist ein Startfehler, kein stiller Default', async () => {
  const { hostusBaseUrl, ...unvollstaendig } = VOLL
  await assert.rejects(() => loadConfig({ fetch: createFakeFetch({ json: unvollstaendig }) }), /hostusBaseUrl/)
})

test('ein unerreichbares config.json ist ein Startfehler', async () => {
  await assert.rejects(() => loadConfig({ fetch: createFakeFetch({ status: 404, text: 'not found' }) }), /config\.json/)
})

test('kaputtes JSON in config.json wird verständlich gemeldet', async () => {
  await assert.rejects(
    () => loadConfig({ fetch: createFakeFetch({ status: 200, text: '{kaputt' }) }),
    /config\.json/,
  )
})
