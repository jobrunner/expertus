import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCALES, classesFor, toPercent, classFor, isValidPercent, naechsteStufe, PROZENTSTUFEN } from '../src/cover.js'

test('klassische Skala hat sieben Klassen in aufsteigender Deckung', () => {
  assert.deepEqual(classesFor('bb-classic'), ['r', '+', '1', '2', '3', '4', '5'])
})

test('erweiterte Skala teilt Stufe 2 in 2m, 2a, 2b', () => {
  assert.deepEqual(classesFor('bb-extended'), ['r', '+', '1', '2m', '2a', '2b', '3', '4', '5'])
})

test('Prozentskala hat keine Klassen', () => {
  assert.deepEqual(classesFor('percent'), [])
})

test('klassische Klassenmitten', () => {
  assert.equal(toPercent('bb-classic', 'r'), 0.1)
  assert.equal(toPercent('bb-classic', '+'), 0.5)
  assert.equal(toPercent('bb-classic', '1'), 2.5)
  assert.equal(toPercent('bb-classic', '2'), 15)
  assert.equal(toPercent('bb-classic', '3'), 37.5)
  assert.equal(toPercent('bb-classic', '4'), 62.5)
  assert.equal(toPercent('bb-classic', '5'), 87.5)
})

test('erweiterte Klassenmitten unterscheiden sich nur in Stufe 2', () => {
  assert.equal(toPercent('bb-extended', '2m'), 4)
  assert.equal(toPercent('bb-extended', '2a'), 10)
  assert.equal(toPercent('bb-extended', '2b'), 20)
  assert.equal(toPercent('bb-extended', '3'), 37.5)
})

test('Stufe 2 existiert in der erweiterten Skala nicht', () => {
  assert.throws(() => toPercent('bb-extended', '2'), RangeError)
})

test('unbekannte Skala wird abgewiesen', () => {
  assert.throws(() => toPercent('braun-blanquet', 'r'), RangeError)
})

test('classFor findet die Klasse nur bei exakter Übereinstimmung', () => {
  assert.equal(classFor('bb-classic', 37.5), '3')
  // 24,65 % ist keine Klassenmitte: die Zeile behält ihren Prozentwert und
  // verliert das Etikett, statt auf eine nie gemessene Klasse gerundet zu werden.
  assert.equal(classFor('bb-classic', 24.65), null)
})

test('classFor über Skalengrenzen: 15 % ist klassisch Stufe 2, erweitert etikettlos', () => {
  assert.equal(classFor('bb-classic', 15), '2')
  assert.equal(classFor('bb-extended', 15), null)
})

test('Deckung ist größer als null und höchstens hundert', () => {
  assert.equal(isValidPercent(0), false)
  assert.equal(isValidPercent(0.1), true)
  assert.equal(isValidPercent(100), true)
  assert.equal(isValidPercent(100.1), false)
  assert.equal(isValidPercent(Number.NaN), false)
  assert.equal(isValidPercent('5'), false)
})

test('jede Klasse jeder Skala liefert eine gültige Deckung', () => {
  for (const scale of ['bb-classic', 'bb-extended']) {
    for (const c of classesFor(scale)) {
      assert.equal(isValidPercent(toPercent(scale, c)), true, `${scale}/${c}`)
    }
  }
})

test('SCALES nennt die drei Eingabemodi', () => {
  assert.deepEqual(Object.keys(SCALES).sort(), ['bb-classic', 'bb-extended', 'percent'])
})

test('die Plus-Taste springt auf die nächste übliche Stufe', () => {
  assert.equal(naechsteStufe(10, 1), 15)
  assert.equal(naechsteStufe(15, 1), 20)
  // Zwischenwerte landen auf der nächstgelegenen Stufe in Richtung, nicht
  // auf einem Raster: wer 23 eingetragen hat, kommt auf 25.
  assert.equal(naechsteStufe(23, 1), 25)
  assert.equal(naechsteStufe(23, -1), 20)
})

test('an den Enden bleibt der Wert stehen', () => {
  assert.equal(naechsteStufe(100, 1), 100)
  assert.equal(naechsteStufe(0.1, -1), 0.1)
})

test('ohne Wert beginnt Plus unten und Minus oben', () => {
  assert.equal(naechsteStufe(null, 1), 0.1)
  assert.equal(naechsteStufe(null, -1), 100)
})

test('die Klassenmittelwerte sind Stufen', () => {
  // Sonst landete ein Skalenwechsel auf einem Wert, den die Knöpfe nicht
  // mehr treffen.
  for (const scale of ['bb-classic', 'bb-extended']) {
    for (const wert of Object.values(SCALES[scale].classes)) {
      assert.ok(PROZENTSTUFEN.includes(wert), `${wert} fehlt in den Stufen`)
    }
  }
})
