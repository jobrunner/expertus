#!/usr/bin/env node
// Layer 3, statischer Teil: ruft das Skript des Skills über die Routen auf,
// die ohne vorbereiteten Zustand sinnvoll sind. Die Zustände, die es nicht
// erreicht, prüft e2e/a11y.spec.js.
//
// --import lädt axe-playwright-context-shim.mjs, bevor das Skill-Skript
// läuft: es öffnet die Seite über browser.newPage(), und @axe-core/
// playwright braucht darin (ab Version 4.3, für axe.finishRun()) eine
// zweite Seite im selben Kontext — Playwright verweigert die dort aber,
// weil newPage() den Kontext als "owned" markiert. Der Shim gleicht das
// aus, ohne eine Zeile des Skills zu ändern (siehe dort für Details).
import { spawnSync } from 'node:child_process'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const SHIM = 'scripts/axe-playwright-context-shim.mjs'
const SKRIPT = '.claude/skills/web-accessibility-audit/scripts/axe-audit.mjs'

const { status } = spawnSync('node', ['--import', `./${SHIM}`, SKRIPT, '/index.html', '/index.html#/plots'], {
  stdio: 'inherit',
  env: { ...process.env, BASE_URL },
})
process.exit(status ?? 1)
