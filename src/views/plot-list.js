// Liste und Suche. Speist sich aus dem Index, nicht aus den Plots selbst.
import { el, clear } from '../dom.js'
import { formatCoord, resultLabel, statusLabel } from '../format.js'
import { hashFor } from '../router.js'

const STATUS_OPTIONEN = [
  ['', 'alle'],
  ['none', 'nicht ausgewertet'],
  ['ok', 'ausgewertet'],
  ['stale', 'veraltet'],
  ['error', 'Fehler'],
]

export function renderPlotList({ mount, store, storage, actions, router }) {
  let query = ''
  let status = ''

  function draw() {
    const treffer = storage.search({ q: query, status: status || null })
    clear(mount)
    mount.append(
      el('h2', { text: 'Plots' }),
      el('div', { class: 'toolbar' }, [
        el('button', { type: 'button', text: 'Neuen Plot anlegen', onClick: () => router.go({ name: 'plot', sampleId: actions.newPlot().sampleId }) }),
        labelled('Suche', el('input', { type: 'search', id: 'suche', value: query, onInput: (e) => { query = e.target.value; draw() } })),
        labelled('Status', el('select', { id: 'status', onChange: (e) => { status = e.target.value; draw() } },
          STATUS_OPTIONEN.map(([v, t]) => el('option', { value: v, text: t, selected: v === status })))),
      ]),
      body(treffer),
    )
  }

  function body(treffer) {
    if (!storage.list().length) return el('p', { text: 'Noch kein Plot erfasst.' })
    if (!treffer.length) return el('p', { text: 'Kein Plot passt zur Suche.' })
    return el('table', {}, [
      el('thead', {}, el('tr', {}, ['Sample-ID', 'Koordinate', 'Arten', 'Ergebnis', 'Status'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, treffer.map((e) =>
        el('tr', {}, [
          el('td', {}, el('a', { href: hashFor({ name: 'plot', sampleId: e.sampleId }), text: e.sampleId })),
          el('td', { text: `${formatCoord(e.lat)} / ${formatCoord(e.lon)}` }),
          el('td', { text: String(e.speciesCount) }),
          el('td', { text: resultLabel(e.result) }),
          el('td', { text: statusLabel(e.status) }),
        ]),
      )),
    ])
  }

  // Jedes Bedienelement bekommt ein echtes <label>: aria-label allein
  // verliert die Klickfläche und wird von Übersetzungswerkzeugen übergangen.
  function labelled(text, control) {
    return el('p', {}, [el('label', { for: control.id, text }), control])
  }

  // Ohne Abmeldung zeichnet eine längst verlassene Ansicht bei jeder
  // Zustandsänderung weiter in den gemeinsamen Einhängepunkt: der Store
  // kennt sie noch, obwohl die Route längst weitergezogen ist.
  const unsubscribe = store.subscribe(draw)
  draw()

  return () => unsubscribe()
}
