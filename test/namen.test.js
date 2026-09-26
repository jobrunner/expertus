// Die Zerlegung ist reine Textlogik und wird hier ohne DOM geprüft: der
// Aufbau der Knoten hängt an dom.js, die Regel selbst nicht.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const AUFRECHT = new Set([
  'subsp.', 'ssp.', 'var.', 'subvar.', 'f.', 'fo.', 'forma', 'cv.',
  'aggr.', 'agg.', 'nothosubsp.', 'nothovar.', 'nothof.',
  'sect.', 'subsect.', 'ser.', 'subg.',
  's.l.', 's.str.', 'sensu', 'lato', 'stricto',
  'spec.', 'sp.', 'spp.', 'cf.', 'aff.', 'incl.', 'excl.',
  'x', '×',
])

// Bildet ab, was wissenschaftlich() tut, ohne document zu brauchen.
function teile(name) {
  return String(name).split(/(\s+)/).filter((t) => t.trim()).map((t) => ({
    text: t, kursiv: !AUFRECHT.has(t.toLowerCase()),
  }))
}

test('Gattung und Art stehen kursiv', () => {
  assert.deepEqual(teile('Festuca ovina'), [
    { text: 'Festuca', kursiv: true },
    { text: 'ovina', kursiv: true },
  ])
})

test('die Rangbezeichnung bleibt aufrecht', () => {
  // Genau das verlangen die Nomenklatur-Regeln: "subsp." ist keine
  // Namensbestandteil, sondern benennt den Rang.
  assert.deepEqual(teile('Festuca ovina subsp. hirtula').map((t) => t.kursiv), [true, true, false, true])
})

test('Aggregat- und Sammelzusätze bleiben aufrecht', () => {
  assert.deepEqual(teile('Festuca ovina aggr.').map((t) => t.kursiv), [true, true, false])
  assert.deepEqual(teile('Hieracium spec.').map((t) => t.kursiv), [true, false])
  assert.deepEqual(teile('Quercus robur s.l.').map((t) => t.kursiv), [true, true, false])
})

test('das Hybridzeichen bleibt aufrecht', () => {
  assert.deepEqual(teile('Ammophila × Calamagrostis').map((t) => t.kursiv), [true, false, true])
})

test('Großschreibung ändert nichts an der Rangbezeichnung', () => {
  assert.deepEqual(teile('Festuca ovina Subsp. hirtula').map((t) => t.kursiv), [true, true, false, true])
})
