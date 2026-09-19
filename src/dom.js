// Kleine Helfer statt einer Template-Sprache. Alles, was Text ist, geht über
// textContent — nie über innerHTML: ein Artname aus einem fremden Dienst ist
// Fremdtext, und die CSP würde Inline-Skript zwar blocken, aber ein
// eingeschleustes Attribut nicht.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'text') node.textContent = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

export function clear(node) {
  node.replaceChildren()
}

// svgIcon baut ein Symbol des Design-Systems aus fertigem SVG-Markup.
// Anders als el() setzt es dieses Markup NICHT über textContent, sondern
// lässt es vom Parser als Elemente lesen — und genau deshalb ist diese
// Funktion eng begrenzt: sie darf ausschließlich mit Markup aufgerufen
// werden, das über /assets/icons.js vom eigenen Server kommt (siehe
// internal/server/server.go, iconsJSHandler), nie mit einem Artnamen aus
// hostus oder sonst einer Zeichenkette, die nicht aus dieser einen Quelle
// stammt. Der Kommentar oben zu el() bleibt damit unverändert gültig: für
// jeden Text, der von außen kommt, gilt weiterhin textContent, nie
// innerHTML.
export function svgIcon(markup) {
  const vorlage = document.createElement('template')
  vorlage.innerHTML = markup
  return vorlage.content.firstElementChild
}

// Statuswechsel müssen angesagt werden, nicht nur farblich erscheinen.
// Der Text wird immer neu gesetzt, damit auch eine Wiederholung derselben
// Meldung vorgelesen wird.
export function announce(liveRegion, text) {
  liveRegion.textContent = ''
  liveRegion.textContent = text
}

// Ein Neuaufbau des Einhängepunkts (clear + append) reißt sonst den Fokus
// mit: nach jedem Tastendruck in einem Feld, das bei jeder Änderung neu
// zeichnet, läge der Fokus im Nichts und die Tastatur wäre für dieses Feld
// nur noch für ein einziges Zeichen nutzbar. Vor dem Aufbau werden Kennung
// und — bei einem Textfeld — die Position der Schreibmarke gemerkt, danach
// beides wiederhergestellt. Wird auch von der Artentabelle gebraucht.
//
// Ein Neuaufbau kann auch durch ein völlig unbeteiligtes Ereignis ausgelöst
// werden — die Kopfdaten aus ortus treffen nebenläufig ein, während die
// Nutzerin längst in der Art-Suche tippt. Die Art-Suche kennt keinen
// eigenen Platz im Store (ihr Text ist reine Bedienung, kein Plot-Datum);
// ohne diesen Ausgleich würde ein solcher Neuaufbau den gerade eingegebenen,
// noch nicht abgeschickten Text kommentarlos verwerfen. Der Wert des
// fokussierten Felds wird deshalb — wie schon der Fokus selbst — mit
// hinübergenommen, sofern der frische Aufbau dort selbst nichts einträgt.
// Wer ein Feld absichtlich leert (siehe combobox.js, uebernehmen()), tut
// das deshalb VOR der auslösenden Aktion, nicht danach: sonst würde genau
// dieser Ausgleich den gelöschten Text hier wiederherstellen.
export function preserveFocus(container, render) {
  const active = container.contains(document.activeElement) ? document.activeElement : null
  const id = active?.id || null
  const hasValue = active && 'value' in active
  const value = hasValue ? active.value : null
  const hasSelection = active && typeof active.selectionStart === 'number'
  const selectionStart = hasSelection ? active.selectionStart : null
  const selectionEnd = hasSelection ? active.selectionEnd : null

  render()

  if (!id) return
  const restored = container.querySelector(`#${CSS.escape(id)}`)
  if (!restored) return
  // Als Microtask, nicht sofort: render() kann selbst aus einem Fokus- oder
  // Tastaturereignis heraus laufen (z. B. "blur" auf dem gerade entfernten
  // Element). Ein sofortiges focus() mitten in dessen Verarbeitung würde
  // verschachtelt erneut dasselbe Ereignis auslösen. Eine Microtask läuft
  // erst, wenn die aktuelle Ereignisverarbeitung fertig ist.
  queueMicrotask(() => {
    restored.focus()
    // Nur übernehmen, wenn der frische Aufbau das Feld leer gelassen hat:
    // ein aus dem Store gespeistes Feld (Breite, Country, …) trägt nach dem
    // Neuaufbau bereits seinen aktuellen, gültigen Wert — der wird nicht
    // überschrieben.
    if (hasValue && restored.value === '' && value !== '') restored.value = value
    if (selectionStart !== null && typeof restored.setSelectionRange === 'function') {
      try {
        restored.setSelectionRange(selectionStart, selectionEnd)
      } catch {
        // Manche Eingabetypen (z. B. number) erlauben keine Textauswahl —
        // der Fokus bleibt dann trotzdem erhalten, nur ohne Schreibmarke.
      }
    }
  })
}
