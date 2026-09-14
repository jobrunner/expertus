// Minimaler fetch-Ersatz. Bildet nur nach, was die Adapter benutzen:
// ok, status, json(), text(). Aufrufe werden optional mitgeschrieben,
// damit Tests die URL und die Optionen prüfen können.
export function createFakeFetch(response, calls = []) {
  return async (url, options = {}) => {
    calls.push({ url, options })
    const status = response.status ?? 200
    const body = 'json' in response ? JSON.stringify(response.json) : (response.text ?? '')
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return JSON.parse(body)
      },
      async text() {
        return body
      },
    }
  }
}
