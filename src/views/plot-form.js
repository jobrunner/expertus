// Die Maske: Standort, Kopfdaten und die Plätze für Arten und Auswertung
// (Task 16/17 füllen diese als sections). Kopfdaten werden nebenläufig
// geholt — pending blockiert nur den Kopfdaten-Abschnitt, nie die Maske.
import { el, clear, preserveFocus } from '../dom.js'
import { COAST_VALUES, DUNE_VALUES, HEADER_FIELDS } from '../header-map.js'
import { ESY_COUNTRY_NAMES } from '../esy-countries.js'
import { originLabel } from '../format.js'

// Welches Kopfdatum wie von Hand gesetzt wird. Text statt Auswahl nur dort,
// wo es kein endliches Vokabular gibt.
const MANUAL_INPUT = {
  Country: { kind: 'select', options: ESY_COUNTRY_NAMES },
  Coast_EEA: { kind: 'select', options: COAST_VALUES },
  Dunes_Bohn: { kind: 'select', options: DUNE_VALUES },
  Ecoreg: { kind: 'number' },
  'Altitude (m)': { kind: 'number' },
  DEG_LAT: { kind: 'number' },
  DEG_LON: { kind: 'number' },
}

export function renderPlotForm({ mount, store, actions, router, sections = [] }) {
  function draw() {
    // Ein Neuaufbau ersetzt den gesamten Einhängepunkt und würde sonst den
    // Fokus verwerfen: nach jedem Zeichen in einem Zahlenfeld läge er im
    // Nichts, und die Maske wäre über Tastatur unbenutzbar. preserveFocus
    // merkt sich Element und Schreibmarke vor dem Leeren und stellt beides
    // nach dem Aufbau wieder her.
    preserveFocus(mount, () => {
      const { plot, headerPending, error } = store.get()
      if (!plot) {
        clear(mount)
        mount.append(el('p', { class: 'warn', text: 'Diesen Plot gibt es nicht.' }))
        return
      }
      clear(mount)
      // Native append() (anders als unser el()) wandelt ein rohes `null`
      // in den Text "null" um, statt es zu überspringen — deshalb wird
      // hier gefiltert, bevor angehängt wird.
      mount.append(
        ...[
          el('h2', { text: `Plot ${plot.sampleId}` }),
          // Lokal UND sichtbar: der globale Live-Bereich (#meldungen) ist
          // bewusst nur für Ansagen da und optisch verborgen. Eine Meldung
          // wie eine Sample-ID-Kollision braucht eine sehbare Ausgabe direkt
          // in der Maske; role="alert" sorgt zugleich für die Ansage, ohne
          // dass der globale Bereich denselben Text noch einmal spiegelt.
          error ? el('p', { class: 'warn', role: 'alert', text: error.message }) : null,
          standort(plot),
          kopfdaten(plot, headerPending),
          ...sections.map((render) => render(plot)),
        ].filter(Boolean),
      )
    })
  }

  function standort(plot) {
    const breite = el('input', {
      id: 'breite', type: 'text', inputmode: 'decimal', value: plot.coordinate?.lat ?? '',
      onBlur: uebernehmen, onPaste: paste,
    })
    const laenge = el('input', {
      id: 'laenge', type: 'text', inputmode: 'decimal', value: plot.coordinate?.lon ?? '',
      onBlur: uebernehmen, onPaste: paste,
    })
    const sample = el('input', {
      id: 'sample', type: 'text', value: plot.sampleId,
      onBlur: (e) => {
        const neu = e.target.value.trim()
        if (neu && neu !== plot.sampleId && actions.rename(neu)) {
          router.go({ name: 'plot', sampleId: neu })
        }
      },
    })

    function uebernehmen() {
      const lat = Number.parseFloat(String(breite.value).replace(',', '.'))
      const lon = Number.parseFloat(String(laenge.value).replace(',', '.'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      actions.setCoordinate({ lat, lon, source: 'manual' })
      actions.fetchHeader()
    }

    // Aus der ortus-Testkonsole: ein eingefügtes Paar füllt beide Felder.
    function paste(e) {
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const paar = text.split(/[,;\s]+/).map((s) => Number.parseFloat(s.replace(',', '.'))).filter(Number.isFinite)
      if (paar.length !== 2) return
      e.preventDefault()
      breite.value = String(paar[0])
      laenge.value = String(paar[1])
      uebernehmen()
    }

    const gps = el('button', {
      type: 'button', text: 'Aktuellen Standort verwenden',
      'aria-label': 'Aktuellen Standort verwenden',
      onClick() {
        if (!navigator.geolocation) return
        gps.disabled = true
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            breite.value = pos.coords.latitude.toFixed(6)
            laenge.value = pos.coords.longitude.toFixed(6)
            gps.disabled = false
            actions.setCoordinate({
              lat: Number(breite.value), lon: Number(laenge.value),
              source: 'gps', accuracyM: Math.round(pos.coords.accuracy),
            })
            actions.fetchHeader()
          },
          () => { gps.disabled = false },
          { enableHighAccuracy: true, timeout: 10000 },
        )
      },
    })

    return el('section', { 'aria-labelledby': 'h-standort' }, [
      el('h3', { id: 'h-standort', text: 'Standort' }),
      feld('Sample-ID', sample),
      feld('Breite', breite),
      feld('Länge', laenge),
      gps,
      // Im Gelände entscheidet der Unterschied zwischen 8 m und 800 m —
      // der Browser verschweigt ihn sonst, deshalb wird er hier angezeigt.
      plot.accuracyM != null ? el('p', { class: 'muted', text: `± ${plot.accuracyM} m` }) : null,
    ])
  }

  function kopfdaten(plot, pending) {
    return el('section', { 'aria-labelledby': 'h-kopf' }, [
      el('h3', { id: 'h-kopf', text: 'Kopfdaten' }),
      pending ? el('p', { text: 'Kopfdaten werden geholt …' }) : null,
      el('table', {}, [
        el('thead', {}, el('tr', {}, ['Feld', 'Wert', 'Herkunft'].map((t) => el('th', { scope: 'col', text: t })))),
        el('tbody', {}, HEADER_FIELDS.map((f) => zeile(plot, f))),
      ]),
    ])
  }

  function zeile(plot, field) {
    const origin = plot.headerOrigin?.[field] ?? 'missing'
    const value = plot.header?.[field]
    const spec = MANUAL_INPUT[field]
    const id = `h-${field.replace(/[^A-Za-z0-9_-]/g, '-')}`
    const control = spec.kind === 'select'
      // Das volle Vokabular bleibt immer wählbar; die zum aktuellen Wert
      // passende Option trägt "selected", die leere nur, wenn nichts
      // gesetzt ist. Fehlt die passende Option, hält der Nutzer einen
      // gesetzten Wert für fehlend — und kann ihn nicht zurückwählen.
      ? el('select', { id, onChange: (e) => actions.setHeaderField(field, e.target.value) },
          [el('option', { value: '', text: '—', selected: value == null }),
           ...spec.options.map((o) => el('option', { value: o, text: o, selected: o === value }))])
      // Erst beim Verlassen des Felds übernehmen, nicht bei jedem Zeichen:
      // eine Aktion pro Tastendruck würde die Maske neu zeichnen und dabei
      // den Fokus verlieren — über Tastatur ließe sich dann nur ein
      // einziges Zeichen eintippen.
      : el('input', { id, type: 'number', step: 'any', value: value ?? '',
          onBlur: (e) => actions.setHeaderField(field, Number(e.target.value)) })

    return el('tr', {}, [
      el('th', { scope: 'row' }, el('label', { for: control.id, text: field })),
      el('td', {}, [control, beleg(plot, field)]),
      el('td', { class: origin === 'missing' ? 'warn' : 'muted', text: originLabel(origin) }),
    ])
  }

  // Belege — die Quelle hinter einem Wert, etwa der Name der Ökoregion oder
  // die Meeresregion — sind Nebentext, kein eigenes Kopfdatum: sie fließen
  // nirgends in die Auswertung ein.
  function beleg(plot, field) {
    const e = plot.headerEvidence ?? {}
    const text = { Ecoreg: e.ecoName, Coast_EEA: e.seaRegion, Dunes_Bohn: e.bohnUnit, 'Altitude (m)': e.elevationSource }[field]
    return text ? el('span', { class: 'muted', text: ` ${text}` }) : null
  }

  function feld(text, control) {
    return el('p', {}, [el('label', { for: control.id, text }), control])
  }

  // Ohne Abmeldung zeichnet eine längst verlassene Ansicht bei jeder
  // Zustandsänderung weiter in den gemeinsamen Einhängepunkt.
  const unsubscribe = store.subscribe(draw)
  draw()

  return () => unsubscribe()
}
