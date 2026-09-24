// Liste und Suche. Speist sich aus dem Index, nicht aus den Plots selbst.
import { el, clear, stapelbar } from '../dom.js'
import { formatDate, resultLabel, statusLabel } from '../format.js'
import { hashFor } from '../router.js'

const STATUS_OPTIONEN = [
  ['', 'alle'],
  ['none', 'nicht ausgewertet'],
  ['ok', 'ausgewertet'],
  ['stale', 'veraltet'],
  ['error', 'Fehler'],
]


// Die Übersicht beantwortet eine Frage: welchen Plot öffne ich? Dafür
// genügen Kennung, Datum und Ergebnis.
//
// Koordinate und Artenzahl standen früher hier und sind weggefallen — sie
// sind erst im Plot selbst von Belang, kosteten aber je Eintrag zwei
// Zeilen. Ebenso die Spalte "Status": "nicht ausgewertet" stand darin
// wortgleich neben demselben Text unter "Ergebnis". Aus sechs Zeilen je
// Plot werden damit zwei.
function body(treffer, storage) {
  if (!storage.list().length) return el('p', { text: 'Noch kein Plot erfasst.' })
  if (!treffer.length) return el('p', { text: 'Kein Plot passt zur Suche.' })
  return el('div', { class: 'table-wrap' }, stapelbar(el('table', { class: 'plot-liste' }, [
    el('thead', {}, el('tr', {}, ['Sample-ID', 'Datum', 'Ergebnis'].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, treffer.map((e) =>
      el('tr', {}, [
        el('td', {}, el('a', { href: hashFor({ name: 'plot', sampleId: e.sampleId }), text: e.sampleId })),
        el('td', { text: formatDate(e.updatedAt) }),
        // Der Status steckt im Ergebnis: ohne Auswertung steht dort
        // "nicht ausgewertet", eine veraltete wird als solche benannt.
        // Ein noch fehlendes Ergebnis steht gedämpft: "nicht ausgewertet"
        // ist länger als jeder Code und zöge sonst mehr Aufmerksamkeit auf
        // sich als die Plots, die tatsächlich eines haben.
        el('td', { class: ergebnisKlasse(e), text: ergebnisText(e) }),
      ]),
    )),
  ])))
}

function ergebnisKlasse(e) {
  if (e.status === 'stale' || e.status === 'error') return 'warn'
  return e.result ? null : 'muted'
}

function ergebnisText(e) {
  if (e.status === 'stale') return `${resultLabel(e.result)} · ${statusLabel('stale')}`
  if (e.status === 'error') return statusLabel('error')
  return resultLabel(e.result)
}

// Jedes Bedienelement bekommt ein echtes <label>: aria-label allein
// verliert die Klickfläche und wird von Übersetzungswerkzeugen übergangen.
function labelled(text, control) {
  return el('div', { class: 'form-group' }, [el('label', { for: control.id, text }), control])
}

export function renderPlotList({ mount, store, storage, actions, router }) {
  let query = ''
  let status = ''

  // Der Ergebnisbereich ist der einzige Teil, der sich durch Suche, Filter
  // und Zustandsänderungen ändert. Er wird getrennt geführt, weil ein
  // vollständiges Neuzeichnen auch die Werkzeugleiste aus dem DOM nimmt —
  // und ein Eingabefeld, das ersetzt wird, während man darin tippt,
  // verliert den Fokus. Beim Suchfeld war nach einem Zeichen Schluss.
  let ergebnis = null

  function aktuelleTreffer() {
    return storage.search({ q: query, status: status || null })
  }

  function zeichneErgebnis() {
    const naechstes = body(aktuelleTreffer(), storage)
    ergebnis.replaceWith(naechstes)
    ergebnis = naechstes
  }

  function draw() {
    ergebnis = body(aktuelleTreffer(), storage)
    clear(mount)
    mount.append(
      el('h2', { text: 'Plots' }),
      el('div', { class: 'card toolbar' }, [
        // newPlot kann fehlschlagen (voller Speicher); dann gibt es keinen
        // Plot, zu dem navigiert werden könnte — die Meldung steht im
        // Zustand und wird von der Maske angezeigt.
        el('button', { type: 'button', class: 'btn', text: 'Neuen Plot anlegen', onClick: () => {
          const neu = actions.newPlot()
          if (neu) router.go({ name: 'plot', sampleId: neu.sampleId })
        } }),
        labelled('Suche', el('input', { type: 'search', id: 'suche', value: query, onInput: (e) => { query = e.target.value; zeichneErgebnis() } })),
        labelled('Status', el('select', { id: 'status', onChange: (e) => { status = e.target.value; zeichneErgebnis() } },
          STATUS_OPTIONEN.map(([v, t]) => el('option', { value: v, text: t, selected: v === status })))),
      ]),
      ergebnis,
    )
  }



  // Erst das Gerüst, dann das Abonnement: zeichneErgebnis() tauscht nur den
  // Ergebnisbereich aus und setzt deshalb voraus, dass es ihn schon gibt.
  draw()

  // Zustandsänderungen berühren nur die Liste, nie die Werkzeugleiste — so
  // bleibt eine laufende Eingabe unangetastet, wenn nebenher ein Plot
  // gespeichert wird. Ohne Abmeldung zeichnet eine längst verlassene
  // Ansicht weiter in den gemeinsamen Einhängepunkt: der Store kennt sie
  // noch, obwohl die Route weitergezogen ist.
  const unsubscribe = store.subscribe(zeichneErgebnis)

  return () => unsubscribe()
}
