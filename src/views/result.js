// Der Auswertungsabschnitt der Plot-Maske: Ergebniszeile und der
// aufklappbare Anhang, der zeigt, wie das Ergebnis zustande kam. Kein
// eigener Bildschirm — Nachjustieren an der Artenliste bleibt ein
// Knopfdruck, keine Navigation.
import { el, stapelbar } from '../dom.js'
import { resultLabel, statusLabel } from '../format.js'
import { ROLLEN } from '../adapters/situs.js'

export function renderResultSection({ plot, actions, store }) {
  const grund = actions.blockingReason()
  const ev = plot.evaluation
  const { evaluating } = store.get()

  // Der Grund für die Sperre gehört an den Knopf, nicht nur unter ihn: eine
  // lose Textzeile darunter wird beim Ansteuern des Knopfes nicht
  // vorgelesen, und wer nicht sieht, erfährt nie, was noch fehlt.
  const hinweisId = 'auswerten-grund'
  const hinweis = grund ? el('p', { id: hinweisId, class: 'muted', text: grund }) : null

  const node = el('section', { class: 'card', 'aria-labelledby': 'h-ausw' }, [
    el('h3', { id: 'h-ausw', text: 'Auswertung' }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: evaluating ? 'Wird ausgewertet …' : 'Auswerten',
      disabled: Boolean(grund) || evaluating,
      'aria-describedby': hinweis ? hinweisId : null,
      onClick: () => actions.evaluate(),
    }),
    hinweis,
    ergebnis(ev, actions),
    habitat(ev, store, actions),
    ev?.status === 'ok' || ev?.status === 'stale' ? anhang(ev) : null,
  ])

  // Der Abschnitt hält keine Ressourcen; die einheitliche Form hält die
  // Maske frei davon, zwei Rückgabearten unterscheiden zu müssen.
  return { node }
}

// Was situs über den erkannten Typ weiß: Name und Beschreibung sichtbar,
// Pflanzengesellschaften und Arten aufklappbar. Die Beschreibung ist der
// Grund, warum das hier steht — ein Code wie "R55" sagt im Gelände wenig.
//
// Diese Funktion zeichnet nur; angestoßen wird der Abruf in den Aktionen
// (evaluate und openPlot). Ein store.set() aus einer Renderfunktion heraus
// zeichnet mitten im laufenden Durchlauf neu — gemessen entstanden dabei
// kurzzeitig zwei Ansichtsbäume mit doppelter Ergebniszeile.
function habitat(ev, store, actions) {
  const code = ev?.status === 'ok' || ev?.status === 'stale' ? ev.response?.result : null
  if (!code) return null

  const h = store.get().habitat
  if (!h || h.code !== code) return null
  const zwischenstand = warten(h, code, actions)
  if (zwischenstand) return zwischenstand

  return angaben(h.data)
}

// Alles, was vor den eigentlichen Angaben stehen kann: unterwegs,
// gescheitert, oder ein Typ, den situs nicht führt. Getrennt von der
// Darstellung der Angaben selbst, weil beides zusammen die Komplexität
// einer Funktion über die Schranke trieb.
function warten(h, code, actions) {
  if (h.pending) return el('p', { class: 'muted', text: 'Angaben zum Habitattyp werden geholt …' })
  // Ein ausgefallenes Nachschlagewerk bleibt eine Randnotiz: das Ergebnis
  // der Auswertung steht unabhängig davon. Der neue Versuch geschieht auf
  // Zuruf — von selbst zu wiederholen hieße, bei jedem Neuzeichnen erneut
  // anzufragen.
  if (h.error) {
    return el('p', {}, [
      el('span', { class: 'muted', text: 'Angaben zum Habitattyp nicht verfügbar. ' }),
      el('button', {
        type: 'button', class: 'btn btn-secondary', text: 'Erneut versuchen',
        onClick: () => actions.fetchHabitat(code, { erneut: true }),
      }),
    ])
  }
  if (!h.data) return el('p', { class: 'muted', text: `Zu ${code} liegen keine Angaben vor.` })
  return null
}

function angaben(d) {
  return el('div', { class: 'habitat' }, [
    d.name ? el('h4', { text: d.name }) : null,
    d.beschreibung ? el('p', { text: d.beschreibung }) : null,
    // Die Beschreibung ist zitiert, nicht selbst formuliert.
    d.quelle ? el('p', { class: 'muted', text: `Quelle: ${d.quelle}` }) : null,
    syntaxaListe(d.syntaxa),
    artenListe(d.arten),
  ])
}

function syntaxaListe(syntaxa) {
  if (!syntaxa?.length) return null
  return el('details', { class: 'akkordeon' }, [
    el('summary', { text: `Pflanzengesellschaften (${syntaxa.length})` }),
    el('div', { class: 'akkordeon-inhalt' },
      el('ul', {}, syntaxa.map((s) => el('li', {}, [
        el('span', { text: s.name }),
        // Der Autor gehört zum Namen einer Pflanzengesellschaft, steht aber
        // gedämpft: er hilft beim Nachschlagen, nicht beim Erkennen.
        s.autor ? el('span', { class: 'muted', text: ` ${s.autor}` }) : null,
        s.rang ? el('span', { class: 'muted', text: ` · ${s.rang}` }) : null,
      ]))),
    ),
  ])
}

function artenListe(arten) {
  const gruppen = ROLLEN
    .map(([schluessel, bezeichnung]) => [bezeichnung, arten?.[schluessel] ?? []])
    .filter(([, liste]) => liste.length)
  if (!gruppen.length) return null
  const gesamt = gruppen.reduce((summe, [, liste]) => summe + liste.length, 0)

  return el('details', { class: 'akkordeon' }, [
    el('summary', { text: `Arten des Habitattyps (${gesamt})` }),
    el('div', { class: 'akkordeon-inhalt' }, gruppen.flatMap(([bezeichnung, liste]) => [
      el('h5', { text: `${bezeichnung} (${liste.length})` }),
      el('ul', {}, liste.map((a) => el('li', {}, [
        el('span', { text: a.name }),
        kennzahl(a),
      ]))),
    ])),
  ])
}

// Stetigkeit und Treue sind unterschiedliche Maße; situs liefert je nach
// Rolle das eine oder das andere. Ausgeschrieben statt als nackte Zahl:
// "16" allein wäre im Gelände nicht zu deuten.
function kennzahl(a) {
  if (a.fidelity != null) return el('span', { class: 'muted', text: ` · Treue ${a.fidelity}` })
  if (a.constancy != null) return el('span', { class: 'muted', text: ` · Stetigkeit ${a.constancy}` })
  return null
}

function ergebnis(ev, actions) {
  if (!ev) return null
  if (ev.status === 'error') {
    // Die Meldung bleibt am Plot und muss auch nach dem Wiederöffnen
    // dastehen: sie benennt das beanstandete Feld, und ohne sie weiß die
    // Nutzerin nicht, was sie korrigieren soll. Kein role="alert" — im
    // Augenblick des Fehlers sagt die Meldung oben in der Maske (siehe
    // plot-form.js) bereits an; ein zweiter Alarm für dasselbe Ereignis
    // wäre eine Dopplung.
    return el('p', {}, [
      ev.message ? el('span', { class: 'warn', text: ev.message }) : null,
      el('button', { type: 'button', class: 'btn btn-secondary', text: 'Erneut versuchen', onClick: () => actions.evaluate() }),
    ])
  }
  return el('p', {}, [
    el('strong', { text: resultLabel(ev.response.result) }),
    ev.status === 'stale'
      ? el('span', { class: 'warn', text: ` — ${statusLabel('stale')}: der Plot wurde seit dieser Auswertung geändert.` })
      : null,
  ])
}

// Die Gewinnerlogik von ESy v1.2, in Worten. Ohne sie ist nicht erkennbar,
// warum aus fünf Treffern genau dieser eine wurde.
function gewinnerBegruendung(res) {
  if (res.result === '?') return 'Keine Regel trifft zu.'
  if (res.matches.length === 0) return 'Keine Regel trifft zu.'
  if (res.matches.length === 1) return 'Genau eine Regel trifft zu.'
  if (res.result === '+') return 'Mehrere Regeln treffen zu, und keine Prioritätsstufe hat genau einen Treffer.'
  const stufe = res.matches.find((m) => m.code === res.result)?.priority
  return `Mehrere Regeln treffen zu; Stufe ${stufe} ist die höchste Prioritätsstufe mit genau einem Treffer.`
}

function anhang(ev) {
  const res = ev.response
  // <details> hat von Haus aus keinen Namen: der sichtbare Text im
  // <summary> wird erst über aria-labelledby zum Namen der Gruppe — ohne
  // ihn wäre der Anhang für Screenreader eine unbenannte Gruppe.
  return el('details', { 'aria-labelledby': 'h-anhang' }, [
    el('summary', { id: 'h-anhang', text: 'Wie kam das Ergebnis zustande?' }),
    el('h4', { text: 'Treffer' }),
    el('p', { text: gewinnerBegruendung(res) }),
    res.truncatedAt10 ? el('p', { class: 'muted', text: 'Das Original hätte diese Liste bei zehn Treffern abgeschnitten.' }) : null,
    stapelbar(el('table', {}, [
      el('thead', {}, el('tr', {}, ['Code', 'Regel', 'Priorität'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, res.matches.map((m) => el('tr', {}, [
        el('td', { text: m.code }),
        el('td', { text: m.variant ?? '—' }),
        el('td', { text: `Priorität ${m.priority}` }),
      ]))),
    ])),

    el('h4', { text: 'Namensauflösung' }),
    stapelbar(el('table', {}, [
      el('thead', {}, el('tr', {}, ['Eingabe', 'nach Backbone', 'final', 'Status'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, res.resolution.map((s) => el('tr', {}, [
        el('td', { text: s.input }),
        el('td', { text: s.afterBackbone }),
        el('td', { text: s.final }),
        el('td', { class: s.resolved ? 'muted' : 'warn', text: s.resolved ? 'aufgelöst' : 'unaufgelöst' }),
      ]))),
    ])),
    res.resolution.some((s) => !s.resolved)
      ? el('p', { class: 'warn', text: 'Ein unaufgelöster Name ist nicht folgenlos: er gehört zu keiner Gruppe, zählt weiterhin in die Gesamtdeckung und kann damit Dominanztests kippen.' })
      : null,

    el('h4', { text: 'Abgesetzter Request' }),
    el('pre', {}, el('code', { text: JSON.stringify(ev.request, null, 2) })),
    el('h4', { text: 'Versionen' }),
    el('ul', {}, Object.entries(res.versions).map(([k, v]) => el('li', { text: `${k}: ${v}` }))),
  ])
}
