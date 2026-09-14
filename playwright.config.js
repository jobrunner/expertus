import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173' },
  // Statischer Server ohne Build — genau das, was auch der Container tut.
  webServer: {
    command: 'python3 -m http.server 5173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5173/index.html',
    reuseExistingServer: true,
  },
})
