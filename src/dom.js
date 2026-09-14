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

// Statuswechsel müssen angesagt werden, nicht nur farblich erscheinen.
// Der Text wird immer neu gesetzt, damit auch eine Wiederholung derselben
// Meldung vorgelesen wird.
export function announce(liveRegion, text) {
  liveRegion.textContent = ''
  liveRegion.textContent = text
}
