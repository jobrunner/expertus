// Der Artenabschnitt der Maske: Vorschlagssuche (ARIA-Combobox über die
// des Design-Systems, siehe /assets/designsystem.js) und die erfasste
// Liste mit Deckung je Skala.
import { el, stapelbar, svgIcon } from '../dom.js'
import { classesFor, naechsteStufe, SCALES, toPercent } from '../cover.js'
import { formatPercent } from '../format.js'
import { mountCombobox } from '/assets/designsystem.js'
import { schliessen as schliessenSymbol } from '/assets/icons.js'

// Der Hinweis unter einem Vorschlag. Zuvor stand hier bei jedem Treffer
// "nicht Euro+Med" — die Prüfung dahinter konnte nie zutreffen. Jetzt
// liefert hostus ausschließlich Namen aus Euro+Med, und der Hinweis trägt
// das, was der Anwender wirklich braucht: unter welchem Namen der Dienst
// das Konzept führt, wenn er vom übernommenen abweicht, und ob es für das
// Gebiet des Plots verzeichnet ist.
function hinweisFuer(o, region) {
  const teile = []
  if (o.matchedName) teile.push(`für ${o.matchedName}`)
  if (region && !o.inArea) teile.push(`nicht für ${region} verzeichnet`)
  return teile.length ? teile.join(' · ') : null
}

export function renderSpeciesSection({ plot, actions, hostus }) {
  const input = el('input', {
    id: 'art-suche', type: 'text', role: 'combobox', autocomplete: 'off',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'art-liste',
  })
  const listbox = el('ul', { id: 'art-liste', role: 'listbox', class: 'combobox-liste', hidden: true })
  const hinweis = el('p', { class: 'muted' })

  const combobox = mountCombobox({
    input, listbox,
    // idPrefix bleibt "expertus-option-", wie zuvor in combobox-state.js:
    // e2e/species.spec.js prüft aria-activedescendant gegen genau diese
    // Kennung.
    idPrefix: 'expertus-option-',
    // Das Modul kennt nur id, text und einen optionalen hinweis — die
    // Fachlichkeit wird hier auf diese drei Felder abgebildet.
    //
    // Die Gebietsangabe stammt aus den Kopfdaten des Plots und ist die
    // TDWG-Region, die hostus erwartet. Ohne Koordinate gibt es sie nicht;
    // dann sucht der Dienst ohne Gebietsbezug.
    suggest: async (q, opts) => (await hostus.suggest(q, { ...opts, area: plot.tdwgRegion ?? null }))
      .map((o) => ({ id: o.conceptId, text: o.name, hinweis: hinweisFuer(o, plot.tdwgRegion) })),
    onPick: (o) => actions.addSpecies({ name: o.text, conceptId: o.id ?? null, entry: o.id ? 'suggest' : 'manual' }),
    // Fällt hostus aus, blockiert das die Erfassung nicht: der Name bleibt
    // von Hand eingebbar, nur der Hinweis erscheint.
    onError: () => { hinweis.textContent = 'Vorschläge nicht verfügbar — Name von Hand eingeben.' },
  })

  const doppelt = plot.species.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)

  const node = el('section', { class: 'card', 'aria-labelledby': 'h-arten' }, [
    el('h3', { id: 'h-arten', text: 'Arten' }),
    el('p', {}, [
      el('label', { for: 'skala', text: 'Deckungsskala' }),
      el('select', { id: 'skala', onChange: (e) => actions.setScale(e.target.value) },
        Object.entries(SCALES).map(([k, v]) => el('option', { value: k, text: v.label, selected: k === plot.scale }))),
    ]),
    el('div', { class: 'form-group combobox' }, [el('label', { for: 'art-suche', text: 'Art suchen' }), input, listbox]),
    hinweis,
    // Mehrfachnennung wird gewarnt, nicht zusammengeführt: habitatus
    // vereinigt Deckungen nach eigenem Verfahren (Jennings-Fischer), eine
    // stille Zusammenführung im Frontend würde diesen Schritt verfälschen.
    ...[...new Set(doppelt)].map((n) => el('p', { class: 'warn', text: `${n} steht mehrfach in der Liste.` })),
    tabelle(plot, actions),
  ])

  // Die Vorschlagssuche hält einen Entprellungs-Timer und einen
  // AbortController. Ein Neuaufbau der Maske ersetzt diesen Abschnitt; ohne
  // Rückgabe der Aufräumfunktion feuerte der alte Timer weiter und schickte
  // eine Netzanfrage in einen längst ersetzten Baum. Die Maske sammelt sie
  // ein und ruft sie beim nächsten Aufbau.
  return { node, cleanup: () => combobox.destroy() }
}

// Auf einem Telefon ist jede Art eine Zeile: Name links, Deckung rechts,
// Entfernen als Symbol. Vorher brauchte eine Art vier Zeilen und 175 Pixel,
// nur um eine Deckung einzutragen — bei zwölf Arten 1155 Pixel, die man
// durchscrollt, statt die Liste zu überblicken.
//
// Die Herkunft (aus Vorschlag / von Hand) ist keine eigene Spalte mehr: sie
// ist Metainformation zu einem Namen, kein Erfassungswert, und steht als
// Zeichen am Namen. Damit fällt eine Spalte weg, auf jedem Schirm.
function tabelle(plot, actions) {
  if (!plot.species.length) return el('p', { text: 'Noch keine Art erfasst.' })
  return stapelbar(el('table', { class: 'arten-liste' }, [
    el('thead', {}, el('tr', {}, ['Art', 'Deckung', ''].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, plot.species.map((s, i) => el('tr', {}, [
      el('td', {}, [el('span', { text: s.name }), herkunft(s)]),
      el('td', {}, deckung(plot, s, i, actions)),
      el('td', {}, entfernenKnopf(s, i, actions)),
    ]))),
  ]))
}

// Ein hochgestelltes Zeichen statt eines Worts: die Herkunft unterscheidet
// zwei Fälle und braucht dafür keine Textspalte. Der ausgeschriebene Text
// steht im title und wird Hilfsmitteln über aria-label angesagt — das
// Zeichen allein wäre für sich nicht zu deuten.
function herkunft(s) {
  const ausVorschlag = s.entry === 'suggest'
  return el('sup', {
    class: 'muted herkunft',
    text: ausVorschlag ? '\u1d65' : '\u2095',
    title: ausVorschlag ? 'aus Vorschlag' : 'von Hand',
    'aria-label': ausVorschlag ? 'aus Vorschlag' : 'von Hand',
  })
}

// Der Text "entfernen" nahm auf dem Telefon eine ganze Zeile ein. Als
// Symbolknopf bleibt die Zielfläche bei 2,75 rem (WCAG 2.5.8 verlangt
// 24 x 24 px), und der zugängliche Name nennt weiterhin die Art — ein
// bloßes "entfernen" wäre in einer Liste aus zwölf gleichen Knöpfen nicht
// zu unterscheiden.
function entfernenKnopf(s, i, actions) {
  const knopf = el('button', {
    type: 'button',
    class: 'btn btn-secondary btn-icon',
    'aria-label': `${s.name} entfernen`,
    title: `${s.name} entfernen`,
    onClick: () => actions.removeSpecies(i),
  })
  knopf.append(svgIcon(schliessenSymbol))
  return knopf
}

// Zwanzig Zeilen mit zwanzig gleich benannten Deckungsfeldern wären ohne
// eigene Beschriftung nicht unterscheidbar; die Beschriftung nennt darum den
// Artnamen und ist optisch verborgen, weil "Deckung" bereits in der
// Spaltenüberschrift steht.
function deckung(plot, s, i, actions) {
  // Als ein Bündel weitergereicht statt als sechs Argumente: id und label
  // gehören zusammen und werden hier einmal gebildet.
  const feld = { plot, s, i, actions, id: `deckung-${i}`, label: `Deckung von ${s.name}` }
  return plot.scale === 'percent' ? prozentfeld(feld) : klassenauswahl(feld)
}

// Die Klasse trägt ihren Prozentwert im Eintrag selbst: "2 (~15 %)". Zuvor
// stand er als eigene Zeile unter der Auswahl und hing dort ohne Bezug —
// und bei der Prozentskala doppelt neben dem Feld, das ihn schon zeigt.
//
// Die Tilde gehört dazu: Es ist der Mittelwert der Klasse, nicht der
// gemessene Wert. Wer 15 % schätzt, wählt Klasse 2; die Klasse umfasst
// aber 5 bis 25 %.
function klassenauswahl({ plot, s, i, actions, id, label }) {
  return el('span', { class: 'deckungsklasse-feld' }, [
    el('label', { for: id, class: 'visually-hidden', text: label }),
    el('select', { id, class: 'deckungsklasse', onChange: (e) => actions.setCover(i, { classCode: e.target.value }) },
      [el('option', { value: '', text: '—' }),
       ...classesFor(plot.scale).map((c) => el('option', {
         value: c,
         text: `${c} (~${formatPercent(toPercent(plot.scale, c))})`,
         selected: c === s.coverClass,
       }))]),
    klassenloserWert(s),
  ])
}

// Ein Prozentwert ohne passende Klasse in der eingestellten Skala. Das
// entsteht beim Skalenwechsel: 15 % ist in Braun-Blanquet klassisch die
// Klasse 2, in der erweiterten Fassung liegt zwischen 2a (10 %) und
// 2b (20 %) nichts. Der Wert bleibt erhalten und zählt für die Auswertung
// — ohne diese Anzeige stünde die Auswahl auf "—" und er wäre unsichtbar.
function klassenloserWert(s) {
  if (s.cover == null || s.coverClass) return null
  return el('span', { class: 'muted deckung-ohne-klasse', text: formatPercent(s.cover) })
}

// Ein Zahlenfeld mit zwei Knöpfen, die auf die nächste übliche Stufe
// springen. Kein natives type="number": dessen Schrittweite ist fest, und
// Deckungen werden unten fein und oben grob geschätzt — von 1 auf 2, aber
// von 80 auf 90. Eigene Werte bleiben eingebbar; die Knöpfe sind eine
// Abkürzung, keine Einschränkung.
function prozentfeld({ plot, s, i, actions, id, label }) {
  const feld = el('input', {
    id, type: 'text', inputmode: 'decimal', class: 'deckungsprozent',
    // Mit Komma angezeigt, wie überall sonst in der Oberfläche: die
    // Eingabe nimmt beides entgegen, die Anzeige soll nicht zwischen
    // "37,5 %" daneben und "37.5" im Feld schwanken.
    value: s.cover == null ? '' : String(s.cover).replace('.', ','),
    onChange: (e) => actions.setCover(i, { percent: Number(String(e.target.value).replace(',', '.')) }),
  })
  const stufe = (richtung) => () => actions.setCover(i, { percent: naechsteStufe(s.cover, richtung) })
  return el('span', { class: 'deckungsspinner' }, [
    el('label', { for: id, class: 'visually-hidden', text: label }),
    // Die Knöpfe nennen die Art: in einer Liste aus zwanzig Zeilen wäre
    // "weniger" allein nicht zu unterscheiden.
    el('button', {
      type: 'button', class: 'btn btn-secondary btn-icon', text: '\u2212',
      'aria-label': `${label} verringern`, title: `${label} verringern`, onClick: stufe(-1),
    }),
    feld,
    el('button', {
      type: 'button', class: 'btn btn-secondary btn-icon', text: '+',
      'aria-label': `${label} erhöhen`, title: `${label} erhöhen`, onClick: stufe(1),
    }),
    // Die Einheit gehört sichtbar dazu: im Feld steht nur die Zahl, und
    // eine nackte "24,65" sagt nicht, worum es geht.
    el('span', { class: 'muted deckung-einheit', text: '%' }),
  ])
}
