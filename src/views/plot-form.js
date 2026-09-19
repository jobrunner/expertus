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
import { mountKoordinaten } from '/assets/designsystem.js'

// Dieselben sieben Systeme wie bei Ortus, wortgleich aus dessen frontend.go
// (sridConfig, siehe internal/adapters/http/frontend.go) übernommen: beide
// Dienste sollen dieselben Bezeichnungen zeigen. Möglich ist die Auswahl nur,
// weil Expertus die Koordinate an ortus schickt und ortus sie umrechnet
// (Aufgabe 12) — Tempus kennt dagegen nur WGS 84 und zeigt deshalb gar keine
// Auswahl (mountKoordinaten blendet sie bei einem einzigen System aus).
const KOORDINATENSYSTEME = [
  {
    id: '4326', name: 'WGS 84',
    xLabel: 'Längengrad (Lon)', yLabel: 'Breitengrad (Lat)',
    xPlaceholder: 'z.B. 13.405', yPlaceholder: 'z.B. 52.52',
    yZuerst: true,
  },
  {
    id: '3857', name: 'Web Mercator',
    xLabel: 'X (Meter)', yLabel: 'Y (Meter)',
    xPlaceholder: 'z.B. 1492273', yPlaceholder: 'z.B. 6894026',
  },
  {
    id: '25832', name: 'ETRS89 / UTM Zone 32N',
    xLabel: 'Rechtswert (E)', yLabel: 'Hochwert (N)',
    xPlaceholder: 'z.B. 389524', yPlaceholder: 'z.B. 5820270',
  },
  {
    id: '25833', name: 'ETRS89 / UTM Zone 33N',
    xLabel: 'Rechtswert (E)', yLabel: 'Hochwert (N)',
    xPlaceholder: 'z.B. 389524', yPlaceholder: 'z.B. 5820270',
  },
  {
    id: '31466', name: 'DHDN / Gauß-Krüger Zone 2',
    xLabel: 'Rechtswert', yLabel: 'Hochwert',
    xPlaceholder: 'z.B. 2597000', yPlaceholder: 'z.B. 5735000',
  },
  {
    id: '31467', name: 'DHDN / Gauß-Krüger Zone 3',
    xLabel: 'Rechtswert', yLabel: 'Hochwert',
    xPlaceholder: 'z.B. 3597000', yPlaceholder: 'z.B. 5735000',
  },
  {
    id: 'mgrs', name: 'MGRS (Military Grid Reference System)',
    xLabel: 'MGRS', xPlaceholder: '32U NA 01234 56789',
    einzelfeld: true,
  },
]

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

function feld(text, control) {
  return el('div', { class: 'form-group' }, [el('label', { for: control.id, text }), control])
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

// Das Gerüst, an das mountKoordinaten bindet (siehe die Kennungen in
// js/koordinaten.js des Design-Systems): eine optionale Systemauswahl, ein
// Gitter mit den Feldern für x/y sowie ein einzelnes Textfeld für MGRS.
// Beschriftungen und Platzhalter trägt das Modul selbst ein — hier bleiben
// die Label-Texte deshalb leer.
// Liefert neben dem Container auch applyExternalCoordinate(): der GPS-Knopf
// setzt darüber eine WGS-84-Koordinate, ohne die Bedienform-Felder selbst
// anzufassen — das hält GPS-Knopf und Koordinateneingabe unabhängig
// voneinander testbar und lesbar.
function buildKoordinatenEingabe(plot, actions) {
  const idPrefix = 'standort'
  const auswahl = el('select', { id: `${idPrefix}-system` })
  const feldX = el('input', { id: `${idPrefix}-x`, type: 'text', inputmode: 'decimal' })
  const feldY = el('input', { id: `${idPrefix}-y`, type: 'text', inputmode: 'decimal' })
  const feldEinzel = el('input', { id: `${idPrefix}-einzel`, type: 'text', autocomplete: 'off' })
  const gitter = el('div', { class: 'koord-gitter' }, [feld('', feldX), feld('', feldY)])
  const container = el('div', {}, [
    feld('Koordinatensystem', auswahl),
    gitter,
    feld('', feldEinzel),
  ])

  // Was zuletzt aus der Bedienform kam — onChange läuft bei jedem
  // Tastendruck, aber übernommen wird erst beim Verlassen des Felds (wie
  // bisher bei Breite/Länge): eine Aktion pro Zeichen würde die Maske bei
  // jedem Tastendruck neu zeichnen.
  let letzte = { system: KOORDINATENSYSTEME[0].id, x: '', y: '', text: '' }
  mountKoordinaten({
    container,
    systeme: KOORDINATENSYSTEME,
    idPrefix,
    onChange: (payload) => { letzte = payload },
  })

  // Ein bereits gespeicherter Plot zeigt seine zuletzt eingegebenen
  // Rohwerte im richtigen System, statt immer bei WGS 84 leer zu starten.
  // auswahl.value setzen und ein change-Ereignis auslösen übernimmt
  // Beschriftung, Feldreihenfolge und das Freimachen der Felder — genau
  // wie beim GPS-Knopf unten und wie bei Ortus selbst.
  if (plot.coordInput) {
    const { system, x, y, text } = plot.coordInput
    auswahl.value = system
    auswahl.dispatchEvent(new Event('change'))
    if (system === 'mgrs') feldEinzel.value = text ?? ''
    else {
      feldX.value = x ?? ''
      feldY.value = y ?? ''
    }
    letzte = { system, x: feldX.value, y: feldY.value, text: feldEinzel.value }
  }

  function uebernehmen() {
    actions.setCoordinateInput({ ...letzte, source: 'manual' })
    actions.fetchHeader()
  }
  feldX.addEventListener('blur', uebernehmen)
  feldY.addEventListener('blur', uebernehmen)
  feldEinzel.addEventListener('blur', uebernehmen)

  // Der GPS-Knopf liefert immer WGS 84 — die Bedienform muss deshalb auf
  // dieses System umgestellt werden, sonst stünden Gradwerte unter der
  // Beschriftung eines anderen Systems. Ortus macht das an derselben
  // Stelle genauso (sridSelect.value = '4326' in dessen frontend.go).
  function applyExternalCoordinate({ lat, lon, source, accuracyM }) {
    auswahl.value = '4326'
    auswahl.dispatchEvent(new Event('change'))
    feldY.value = lat.toFixed(6)
    feldX.value = lon.toFixed(6)
    letzte = { system: '4326', x: feldX.value, y: feldY.value, text: '' }
    actions.setCoordinate({ lat: Number(feldY.value), lon: Number(feldX.value), source, accuracyM })
    actions.fetchHeader()
  }

  return { container, applyExternalCoordinate }
}

// Verweigerte Berechtigung, abgelaufene Zeitgrenze, kein Empfang: ohne
// sichtbare Meldung passiert beim Druck auf den GPS-Knopf scheinbar
// nichts, und die Nutzerin drückt im Gelände wieder und wieder. Der
// Klartext des Browsers wird deshalb unverändert durchgereicht.
function buildGpsButton(applyExternalCoordinate) {
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
          gps.disabled = false
          applyExternalCoordinate({
            lat: pos.coords.latitude, lon: pos.coords.longitude,
            source: 'gps', accuracyM: Math.round(pos.coords.accuracy),
          })
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
  return gps
}

function buildSampleIdField(plot, actions, router) {
  return el('input', {
    id: 'sample', type: 'text', value: plot.sampleId,
    onBlur: (e) => {
      const neu = e.target.value.trim()
      if (neu && neu !== plot.sampleId && actions.rename(neu)) {
        router.go({ name: 'plot', sampleId: neu })
      }
    },
  })
}

function standort(plot, actions, router) {
  const koordinaten = buildKoordinatenEingabe(plot, actions)
  const gps = buildGpsButton(koordinaten.applyExternalCoordinate)
  const sample = buildSampleIdField(plot, actions, router)
  return el('section', { class: 'card', 'aria-labelledby': 'h-standort' }, [
    el('h3', { id: 'h-standort', text: 'Standort' }),
    feld('Sample-ID', sample),
    koordinaten.container,
    gps,
    // Im Gelände entscheidet der Unterschied zwischen 8 m und 800 m —
    // der Browser verschweigt ihn sonst, deshalb wird er hier angezeigt.
    plot.accuracyM != null ? el('p', { class: 'muted', text: `± ${plot.accuracyM} m` }) : null,
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

function zeile(plot, field, actions) {
  const origin = plot.headerOrigin?.[field] ?? 'missing'
  // Ohne Koordinate kann ortus nie gefragt worden sein: dann ist nichts
  // fehlgeschlagen und die Warnfarbe wäre eine Behauptung.
  const abgefragt = plot.coordinate != null
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
    el('td', {
      class: origin === 'missing' && abgefragt ? 'warn' : 'muted',
      text: originLabel(origin, abgefragt),
    }),
  ])
}

function kopfdaten(plot, pending, actions) {
  return el('section', { class: 'card', 'aria-labelledby': 'h-kopf' }, [
    el('h3', { id: 'h-kopf', text: 'Kopfdaten' }),
    pending ? el('p', { class: 'muted', text: 'Kopfdaten werden geholt …' }) : null,
    // Eine breite Tabelle rollt in ihrem eigenen Kasten; die Seite selbst
    // darf nicht waagerecht rollen (WCAG 1.4.10).
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Feld', 'Wert', 'Herkunft'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, HEADER_FIELDS.map((f) => zeile(plot, f, actions))),
    ])),
  ])
}

// Baut den gesamten Mask-Inhalt neu auf. Eigenständige Funktion (statt in
// renderPlotForm verschachtelt), damit sie ihre eigene, überschaubare
// Komplexität trägt statt in der von renderPlotForm aufzugehen — cleanup
// und abschnitte bleiben dagegen dort verschachtelt, weil sie das
// veränderliche sectionCleanups direkt anfassen.
function draw({ mount, store, actions, router, cleanupSections, abschnitte }) {
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
        standort(plot, actions, router),
        kopfdaten(plot, headerPending, actions),
        ...abschnitte(plot),
      ].filter(Boolean),
    )
  })
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

  // Ein Abschnitt liefert { node, cleanup }: die Maske hängt den Knoten ein
  // und merkt sich die Aufräumfunktion bis zum nächsten Aufbau.
  function abschnitte(plot) {
    const gezeichnet = sections.map((render) => render(plot))
    sectionCleanups = gezeichnet.map((a) => a.cleanup).filter(Boolean)
    return gezeichnet.map((a) => a.node)
  }

  const redraw = () => draw({ mount, store, actions, router, cleanupSections, abschnitte })

  // Ohne Abmeldung zeichnet eine längst verlassene Ansicht bei jeder
  // Zustandsänderung weiter in den gemeinsamen Einhängepunkt.
  const unsubscribe = store.subscribe(redraw)
  redraw()

  return () => {
    unsubscribe()
    cleanupSections()
  }
}
