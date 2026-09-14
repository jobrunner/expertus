import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultLabel, statusLabel, originLabel, formatCoord, formatCover } from '../src/format.js'

test('die Sonderzeichen des Ergebnisses werden ausgeschrieben', () => {
  // "?" und "+" allein sagen niemandem etwas.
  assert.equal(resultLabel('?'), 'keine Regel trifft')
  assert.equal(resultLabel('+'), 'mehrdeutig')
  assert.equal(resultLabel('R1A'), 'R1A')
})

test('ein fehlendes Ergebnis heißt nicht ausgewertet', () => {
  assert.equal(resultLabel(null), 'nicht ausgewertet')
})

test('die Statusbezeichnungen sind vollständig', () => {
  assert.equal(statusLabel('none'), 'nicht ausgewertet')
  assert.equal(statusLabel('ok'), 'ausgewertet')
  assert.equal(statusLabel('stale'), 'veraltet')
  assert.equal(statusLabel('error'), 'Fehler')
})

test('die Herkunft eines Kopfdatums wird benannt', () => {
  assert.equal(originLabel('ortus'), 'aus ortus')
  assert.equal(originLabel('manual'), 'von Hand gesetzt')
  assert.equal(originLabel('missing'), 'nicht ableitbar')
})

test('Koordinaten werden auf sechs Nachkommastellen gezeigt', () => {
  assert.equal(formatCoord(52.52), '52.520000')
  assert.equal(formatCoord(null), '—')
})

test('die Deckung zeigt Klasse und Prozent, wenn beides da ist', () => {
  assert.equal(formatCover({ cover: 37.5, coverClass: '3' }), '3 (37,5 %)')
  assert.equal(formatCover({ cover: 24.65, coverClass: null }), '24,65 %')
  assert.equal(formatCover({ cover: null, coverClass: null }), 'ohne Deckung')
})
