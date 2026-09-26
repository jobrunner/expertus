import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultLabel, statusLabel, originLabel, formatCoord, formatCover, formatCoverFull } from '../src/format.js'

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
  // Neben der Auswahl, die die Klasse schon zeigt, bleibt nur der
  // Prozentwert — sonst stünde "[3 ▾] 3 (37,5 %)".
  assert.equal(formatCover({ cover: 37.5, coverClass: '3' }), '37,5 %')
  assert.equal(formatCover({ cover: 24.65, coverClass: null }), '24,65 %')
  assert.equal(formatCover({ cover: null, coverClass: null }), 'ohne Deckung')
  // Vollständig dort, wo keine Auswahl danebensteht.
  assert.equal(formatCoverFull({ cover: 37.5, coverClass: '3' }), '3 (37,5 %)')
  assert.equal(formatCoverFull({ cover: null, coverClass: null }), 'ohne Deckung')
})

test('vor dem ersten Abruf heißt ein fehlendes Kopfdatum "noch nicht abgefragt"', () => {
  // Vor dem ersten Abruf ist nichts fehlgeschlagen — es wurde nur noch
  // nicht gefragt. "nicht ableitbar" behauptete ein Ergebnis, das es nicht
  // gibt, und färbte die halbe Maske in Warnfarbe.
  assert.equal(originLabel('missing', false), 'noch nicht abgefragt')
  assert.equal(originLabel('missing', true), 'nicht ableitbar')
})

test('die übrigen Herkunftstexte hängen nicht am Abruf', () => {
  assert.equal(originLabel('ortus', false), 'aus ortus')
  assert.equal(originLabel('manual', false), 'von Hand gesetzt')
})

test('originLabel bleibt ohne zweites Argument rückwärtskompatibel', () => {
  assert.equal(originLabel('missing'), 'nicht ableitbar')
})
