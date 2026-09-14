// Laufzeit-Ausgleich für den unveränderlichen Skill unter
// .claude/skills/web-accessibility-audit/: dessen scripts/axe-audit.mjs
// öffnet die Seite über browser.newPage(). Playwright markiert den dabei
// entstehenden Kontext intern als "owned" und verweigert darin eine zweite
// Seite. @axe-core/playwright braucht ab Version 4.3 aber genau das — eine
// leere zweite Seite in demselben Kontext, um axe.finishRun() auszuführen
// (der Mechanismus für die geräteübergreifende Zusammenführung; er greift
// unabhängig davon, ob überhaupt iframes im Spiel sind). Die Fehlermeldung
// lautet dann "Please use browser.newContext()".
//
// Dieser Shim ändert keine Zeile des Skills. Er ersetzt nur, bevor dessen
// Skript startet, browser.newPage() durch die gleichwertige Kombination
// aus browser.newContext() + context.newPage() — mit dem einzigen
// Unterschied, dass der entstehende Kontext dabei NICHT als "owned"
// markiert wird und darin später eine zweite Seite erlaubt ist. Eingehängt
// wird er über `node --import`, siehe scripts/axe-audit-routes.mjs.
import { chromium } from '@playwright/test'

const echtesLaunch = chromium.launch.bind(chromium)
chromium.launch = async (...args) => {
  const browser = await echtesLaunch(...args)
  browser.newPage = async (options = {}) => {
    const context = await browser.newContext(options)
    return context.newPage()
  }
  return browser
}
