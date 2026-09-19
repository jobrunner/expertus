// Die Maske: Standort, Kopfdaten und die eingehängten Abschnitte für Arten
// und Auswertung. Kopfdaten werden nebenläufig geholt — pending blockiert
// nur den Kopfdaten-Abschnitt, nie die Maske.
import { el, clear, preserveFocus, svgIcon } from '../dom.js'
import { COAST_VALUES, DUNE_VALUES, HEADER_FIELDS } from '../header-map.js'
import { ESY_COUNTRY_NAMES } from '../esy-countries.js'
import { originLabel } from '../format.js'
import { CollisionError } from '../storage.js'
import { hashFor } from '../router.js'
import { standort as standortSymbol } from '/assets/icons.js'

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
  // Die eingehängten Abschnitte bringen eigene Aufräumarbeit mit (die
  // Vorschlagssuche hält einen Timer und einen AbortController). Ein
  // Neuaufbau erzeugt sie neu; ohne diese Sammlung liefe der alte Timer
  // weiter und feuerte eine Netzanfrage in einen längst ersetzten Baum.
  let sectionCleanups = []

  function cleanupSections() {
    for (const fn of sectionCleanups) fn()
    sectionCleanups = []
  }

  function draw() {
    // Ein Neuaufbau ersetzt den gesamten Einhängepunkt und würde sonst den
    // Fokus verwerfen: nach jedem Zeichen in einem Zahlenfeld läge er im
    // Nichts, und die Maske wäre über Tastatur unbenutzbar. preserveFocus
    // merkt sich Element und Schreibmarke vor dem Leeren und stellt beides
    // nach dem Aufbau wieder her.
    preserveFocus(mount, () => {
      const { plot, headerPending, error } = store.get()
      cleanupSections()
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
          error ? fehlerzeile(error) : null,
          standort(plot),
          kopfdaten(plot, headerPending),
          ...abschnitte(plot),
        ].filter(Boolean),
      )
    })
  }

  // Ein Abschnitt liefert { node, cleanup }: die Maske hängt den Knoten ein
  // und merkt sich die Aufräumfunktion bis zum nächsten Aufbau.
  function abschnitte(plot) {
    const gezeichnet = sections.map((render) => render(plot))
    sectionCleanups = gezeichnet.map((a) => a.cleanup).filter(Boolean)
    return gezeichnet.map((a) => a.node)
  }

  // Eine Namenskollision ist kein Sackgassen-Fehler: der bestehende Plot
  // ist genau das, was die Nutzerin vermutlich sucht. Ohne dieses Angebot
  // müsste sie den Weg über die Liste zurück suchen.
  function fehlerzeile(error) {
    const zeile = el('p', { class: 'warn', role: 'alert', text: error.message })
    if (error instanceof CollisionError) {
      zeile.append(
        document.createTextNode(' '),
        el('a', {
          href: hashFor({ name: 'plot', sampleId: error.sampleId }),
          text: `Plot ${error.sampleId} öffnen`,
        }),
      )
    }
    return zeile
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

    // Verweigerte Berechtigung, abgelaufene Zeitgrenze, kein Empfang: ohne
    // sichtbare Meldung passiert beim Druck auf den GPS-Knopf scheinbar
    // nichts, und die Nutzerin drückt im Gelände wieder und wieder. Der
    // Klartext des Browsers wird deshalb unverändert durchgereicht.
    // Erst beim Auftreten in den Baum gehängt: ein dauerhaft vorhandener,
    // leerer Alarmbereich wäre für Screenreader eine Meldung ohne Inhalt.
    const gpsFehler = el('p', { class: 'warn', role: 'alert' })
    function meldeGps(text) {
      gpsFehler.textContent = text
      if (text) gps.after(gpsFehler)
      else gpsFehler.remove()
    }

    const gps = el('button', {
      type: 'button', class: 'btn btn-secondary',
      onClick() {
        if (!navigator.geolocation) {
          meldeGps('Standortermittlung steht in diesem Browser nicht zur Verfügung.')
          return
        }
        meldeGps('')
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
          (err) => {
            gps.disabled = false
            meldeGps(`Standort nicht ermittelt: ${err.message || 'unbekannter Fehler'}`)
          },
          { enableHighAccuracy: true, timeout: 10000 },
        )
      },
    })
    // Das Symbol ist Schmuck neben der Beschriftung, kein Ersatz für sie
    // (siehe icons.MitBeschriftung im Modul für den Gegenfall): der
    // Knopftext bleibt vollständig, das Symbol kommt nur davor.
    gps.append(svgIcon(standortSymbol), document.createTextNode(' Aktuellen Standort verwenden'))

    return el('section', { class: 'card', 'aria-labelledby': 'h-standort' }, [
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
    return el('section', { class: 'card', 'aria-labelledby': 'h-kopf' }, [
      el('h3', { id: 'h-kopf', text: 'Kopfdaten' }),
      pending ? el('p', { class: 'muted', text: 'Kopfdaten werden geholt …' }) : null,
      // Eine breite Tabelle rollt in ihrem eigenen Kasten; die Seite selbst
      // darf nicht waagerecht rollen (WCAG 1.4.10).
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Feld', 'Wert', 'Herkunft'].map((t) => el('th', { scope: 'col', text: t })))),
        el('tbody', {}, HEADER_FIELDS.map((f) => zeile(plot, f))),
      ])),
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
      // Eine geleerte Eingabe ist kein Wert: Number('') wäre 0, und eine 0
      // ginge als "von Hand gesetzt" still an habitatus. Leer heißt null
      // und damit fehlend.
      : el('input', { id, type: 'number', step: 'any', value: value ?? '',
          onBlur: (e) => {
            const roh = e.target.value.trim()
            actions.setHeaderField(field, roh === '' ? null : Number(roh))
          } })

    return el('tr', {}, [
      el('th', { scope: 'row' }, el('label', { for: control.id, text: field })),
      el('td', {}, [control, beleg(plot, field)]),
      el('td', { class: origin === 'missing' ? 'warn' : 'muted', text: originLabel(origin) }),
    ])
  }

  // Belege — die Quelle hinter einem Wert, etwa der Name der Ökoregion oder
  // die Meeresregion — sind Nebentext, kein eigenes Kopfdatum: sie fließen
  // nirgends in die Auswertung ein.
  // Der Beleg gehört zum Wert des Dienstes. Steht daneben ein von Hand
  // gesetzter Wert, belegt er nichts mehr und würde nur vortäuschen, der
  // eigene Wert käme von dort.
  function beleg(plot, field) {
    if (plot.headerOrigin?.[field] === 'manual') return null
    const e = plot.headerEvidence ?? {}
    const text = { Ecoreg: e.ecoName, Coast_EEA: e.seaRegion, Dunes_Bohn: e.bohnUnit, 'Altitude (m)': e.elevationSource }[field]
    return text ? el('span', { class: 'muted', text: ` ${text}` }) : null
  }

  function feld(text, control) {
    return el('div', { class: 'form-group' }, [el('label', { for: control.id, text }), control])
  }

  // Ohne Abmeldung zeichnet eine längst verlassene Ansicht bei jeder
  // Zustandsänderung weiter in den gemeinsamen Einhängepunkt.
  const unsubscribe = store.subscribe(draw)
  draw()

  return () => {
    unsubscribe()
    cleanupSections()
  }
}
