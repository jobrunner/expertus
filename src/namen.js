// Wissenschaftliche Namen werden kursiv gesetzt — aber nicht vollständig.
// Nach den Nomenklatur-Regeln bleiben die Rangbezeichnungen aufrecht:
//
//     Festuca ovina subsp. hirtula
//     ^^^^^^^^^^^^^      ^^^^^^^  kursiv
//                   ^^^^^^        aufrecht
//
// Ebenso Autorennamen, die bei Syntaxa getrennt geliefert werden und
// deshalb hier nicht vorkommen.
import { el } from './dom.js'

// Rangbezeichnungen und nomenklatorische Zusätze. Kleingeschrieben
// verglichen, damit "Aggr." ebenso trifft.
const AUFRECHT = new Set([
  'subsp.', 'ssp.', 'var.', 'subvar.', 'f.', 'fo.', 'forma', 'cv.',
  'aggr.', 'agg.', 'nothosubsp.', 'nothovar.', 'nothof.',
  'sect.', 'subsect.', 'ser.', 'subg.',
  's.l.', 's.str.', 'sensu', 'lato', 'stricto',
  'spec.', 'sp.', 'spp.', 'cf.', 'aff.', 'incl.', 'excl.',
  'x', '×',
])

// Liefert die Bestandteile eines Namens als Knoten: kursive Epitheta,
// aufrechte Rangbezeichnungen. Bewusst wortweise und ohne Grammatik — eine
// vollständige Namensanalyse gehört in den Dienst, der die Namen führt,
// nicht in die Anzeige. Unbekannte Wörter gelten als Epitheton.
export function wissenschaftlich(name) {
  const text = String(name ?? '')
  if (!text) return []
  return text.split(/(\s+)/).filter(Boolean).map((teil) => (
    AUFRECHT.has(teil.toLowerCase()) || /^\s+$/.test(teil)
      ? document.createTextNode(teil)
      : el('i', { text: teil })
  ))
}

// Dasselbe als fertiges Element, für Stellen, die genau einen Knoten
// einhängen.
export function nameKursiv(name, attrs = {}) {
  return el('span', attrs, wissenschaftlich(name))
}
