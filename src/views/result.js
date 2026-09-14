// Der Auswertungsabschnitt der Plot-Maske: Ergebniszeile und der
// aufklappbare Anhang, der zeigt, wie das Ergebnis zustande kam. Kein
// eigener Bildschirm — Nachjustieren an der Artenliste bleibt ein
// Knopfdruck, keine Navigation.
import { el } from '../dom.js'
import { resultLabel, statusLabel } from '../format.js'

export function renderResultSection({ plot, actions, store }) {
  const grund = actions.blockingReason()
  const ev = plot.evaluation
  const { evaluating } = store.get()

  const node = el('section', { 'aria-labelledby': 'h-ausw' }, [
    el('h3', { id: 'h-ausw', text: 'Auswertung' }),
    el('button', {
      type: 'button',
      text: evaluating ? 'Wird ausgewertet …' : 'Auswerten',
      disabled: Boolean(grund) || evaluating,
      onClick: () => actions.evaluate(),
    }),
    grund ? el('p', { class: 'muted', text: grund }) : null,
    ergebnis(ev, actions),
    ev?.status === 'ok' || ev?.status === 'stale' ? anhang(ev) : null,
  ])

  // Der Abschnitt hält keine Ressourcen; die einheitliche Form hält die
  // Maske frei davon, zwei Rückgabearten unterscheiden zu müssen.
  return { node }
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
      el('button', { type: 'button', text: 'Erneut versuchen', onClick: () => actions.evaluate() }),
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
    el('table', {}, [
      el('thead', {}, el('tr', {}, ['Code', 'Regel', 'Priorität'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, res.matches.map((m) => el('tr', {}, [
        el('td', { text: m.code }),
        el('td', { text: m.variant ?? '—' }),
        el('td', { text: `Priorität ${m.priority}` }),
      ]))),
    ]),

    el('h4', { text: 'Namensauflösung' }),
    el('table', {}, [
      el('thead', {}, el('tr', {}, ['Eingabe', 'nach Backbone', 'final', 'Status'].map((t) => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, res.resolution.map((s) => el('tr', {}, [
        el('td', { text: s.input }),
        el('td', { text: s.afterBackbone }),
        el('td', { text: s.final }),
        el('td', { class: s.resolved ? 'muted' : 'warn', text: s.resolved ? 'aufgelöst' : 'unaufgelöst' }),
      ]))),
    ]),
    res.resolution.some((s) => !s.resolved)
      ? el('p', { class: 'warn', text: 'Ein unaufgelöster Name ist nicht folgenlos: er gehört zu keiner Gruppe, zählt weiterhin in die Gesamtdeckung und kann damit Dominanztests kippen.' })
      : null,

    el('h4', { text: 'Abgesetzter Request' }),
    el('pre', {}, el('code', { text: JSON.stringify(ev.request, null, 2) })),
    el('h4', { text: 'Versionen' }),
    el('ul', {}, Object.entries(res.versions).map(([k, v]) => el('li', { text: `${k}: ${v}` }))),
  ])
}
