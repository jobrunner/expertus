import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173' },
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
    url: 'http://127.0.0.1:5173/index.html',
    reuseExistingServer: true,
    env: {
      ORTUS_BASE_URL: 'https://ortus.test',
      HABITATUS_BASE_URL: 'https://habitatus.test',
      HOSTUS_BASE_URL: 'https://hostus.test',
      PORT: '5173',
    },
  },
})
