import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryStorage } from './helpers/memory-storage.js'

test('memory storage speichert und liest zurück', () => {
  const s = createMemoryStorage()
  s.setItem('a', '1')
  assert.equal(s.getItem('a'), '1')
  assert.equal(s.length, 1)
  assert.equal(s.key(0), 'a')
})

test('memory storage meldet fehlende Schlüssel als null', () => {
  const s = createMemoryStorage()
  assert.equal(s.getItem('fehlt'), null)
})

test('memory storage entfernt Schlüssel', () => {
  const s = createMemoryStorage()
  s.setItem('a', '1')
  s.removeItem('a')
  assert.equal(s.getItem('a'), null)
  assert.equal(s.length, 0)
})
