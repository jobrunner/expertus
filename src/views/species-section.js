// Der Artenabschnitt der Maske: Vorschlagssuche (ARIA-Combobox über die
// des Design-Systems, siehe /assets/designsystem.js) und die erfasste
// Liste mit Deckung je Skala.
import { el } from '../dom.js'
import { classesFor, SCALES } from '../cover.js'
import { formatCover } from '../format.js'
import { mountCombobox } from '/assets/designsystem.js'

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

function tabelle(plot, actions) {
  if (!plot.species.length) return el('p', { text: 'Noch keine Art erfasst.' })
  return el('table', {}, [
    el('thead', {}, el('tr', {}, ['Art', 'Deckung', 'Erfassung', ''].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, plot.species.map((s, i) => el('tr', {}, [
      el('td', { text: s.name }),
      el('td', {}, [deckung(plot, s, i, actions), el('span', { text: ` ${formatCover(s)}` })]),
      el('td', { class: 'muted', text: s.entry === 'suggest' ? 'aus Vorschlag' : 'von Hand' }),
      el('td', {}, el('button', { type: 'button', class: 'btn btn-secondary', text: 'entfernen', 'aria-label': `${s.name} entfernen`, onClick: () => actions.removeSpecies(i) })),
    ]))),
  ])
}

// Zwanzig Zeilen mit zwanzig gleich benannten Deckungsfeldern wären ohne
// eigene Beschriftung nicht unterscheidbar; die Beschriftung nennt darum den
// Artnamen und ist optisch verborgen, weil "Deckung" bereits in der
// Spaltenüberschrift steht.
function deckung(plot, s, i, actions) {
  const id = `deckung-${i}`
  const label = `Deckung von ${s.name}`
  if (plot.scale === 'percent') {
    return el('span', {}, [
      el('label', { for: id, class: 'visually-hidden', text: label }),
      el('input', {
        id, type: 'text', inputmode: 'decimal', value: s.cover ?? '',
        onChange: (e) => actions.setCover(i, { percent: Number(String(e.target.value).replace(',', '.')) }),
      }),
    ])
  }
  return el('span', {}, [
    el('label', { for: id, class: 'visually-hidden', text: label }),
    el('select', { id, onChange: (e) => actions.setCover(i, { classCode: e.target.value }) },
      [el('option', { value: '', text: '—' }),
       ...classesFor(plot.scale).map((c) => el('option', { value: c, text: c, selected: c === s.coverClass }))]),
  ])
}
