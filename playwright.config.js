import { defineConfig } from '@playwright/test'

const TEST_PORT = process.env.E2E_PORT ?? '5174'
const TEST_ADRESSE = `http://127.0.0.1:${TEST_PORT}`

export default defineConfig({
  testDir: './e2e',
  // Eigener Port, getrennt vom Entwicklungsserver auf 5173: sonst übernimmt
  // reuseExistingServer einen von Hand gestarteten Server, dessen CSP auf die
  // echten Dienste zeigt statt auf die *.test-Adressen der Stubs.
  use: { baseURL: TEST_ADRESSE },
  globalSetup: './e2e/helpers/pruefe-server.js',
  // Derselbe Server wie im Container — die Sicherheits-Header und die CSP
  // gelten damit auch im Test. Unter python3 -m http.server fehlten sie,
  // und eine zu enge CSP wäre erst im Betrieb aufgefallen.
  //
  // Die Adressen hier sind dieselben wie in e2e/helpers/stubs.js: die
  // Tests stubben /config.json auf *.test-Domains und mocken die Aufrufe
  // dorthin per page.route — die CSP muss also genau diese Domains
  // nennen, nicht die echten Dienste. Eine Lockerung der Richtlinie wäre
  // dafür nicht nötig gewesen, nur diese Übereinstimmung.
  webServer: {
    command: 'go run ./cmd/expertus',
    url: `${TEST_ADRESSE}/index.html`,
    reuseExistingServer: true,
    env: {
      ORTUS_BASE_URL: 'https://ortus.test',
      HABITATUS_BASE_URL: 'https://habitatus.test',
      HOSTUS_BASE_URL: 'https://hostus.test',
      SITUS_BASE_URL: 'https://situs.test',
      PORT: TEST_PORT,
    },
  },
})
