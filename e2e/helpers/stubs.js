// Die Oberflächentests laufen nie gegen die echten Dienste: sie wären
// langsam, ändern sich ohne unser Zutun und sagen nichts über die
// Oberfläche. Was die Dienste tun, prüfen die Adapter-Tests und make smoke.
const CONFIG = {
  ortusBaseUrl: 'https://ortus.test',
  habitatusBaseUrl: 'https://habitatus.test',
  hostusBaseUrl: 'https://hostus.test',
}

// Dieselben Adressen als flache Liste: die CSP des Testservers muss genau
// sie nennen, sonst blockiert der Browser die gestubbten Aufrufe. Abgeleitet
// statt zweitgeschrieben, damit beides nicht auseinanderläuft.
const ERWARTETE_QUELLEN = Object.values(CONFIG)

const ORTUS_BERLIN = {
  coordinate: { srid: 4326, x: 13.405, y: 52.52 },
  wgs84: { lon: 13.405, lat: 52.52 },
  gazetteer: { admin: { country_iso: 'DE' }, elevation: { meters: 36, source: { name: 'Copernicus DEM GLO-30' } } },
  results: [
    { source_id: 'ecoregions-2017', features: [{ layer: 'ecoregions', properties: { ECO_ID: 654, ECO_NAME: 'Central European mixed forests' } }] },
    { source_id: 'coast-eea-2022', features: [{ layer: 'coast_eea', properties: { coast_eea: 'N_COAST', sea_region: '' } }] },
    { source_id: 'bohn-dunes-2019', features: [{ layer: 'dunes_bohn', properties: { dunes_bohn: 'N_DUNES', bohn_unit: '' } }] },
  ],
}

const HABITATUS_OK = {
  result: 'R1A',
  matches: [
    { code: 'R1A', variant: 'N15', priority: 4 },
    { code: 'R1B', variant: 'N16!', priority: 2 },
  ],
  resolution: [
    { input: 'Festuca ovina', after_backbone: 'Festuca ovina', final: 'Festuca ovina aggr.', resolved: true },
    { input: 'Tippfehlerus', after_backbone: 'Tippfehlerus', final: 'Tippfehlerus', resolved: false },
  ],
  versions: { rulepack: 'EUNIS-ESy-2025-10-03', mode: 'repaired' },
  truncated_at_10: false,
}

const HOSTUS_SUGGEST = {
  backbone_versions: { eurosl: '2024-11-03' },
  results: [
    { concept_id: 'eurosl:concept:aaa', display: 'Festuca ovina', canonical: 'Festuca ovina', rank: 'SPECIES', status: 'ACCEPTED', in_area: true, score: -6 },
    { concept_id: 'wcvp:concept:bbb', display: 'Festuca rubra', canonical: 'Festuca rubra', rank: 'SPECIES', status: 'ACCEPTED', in_area: false, score: -6.1 },
  ],
}

export async function stubServices(page, over = {}) {
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/config.json', (route) => route.fulfill(json(over.config ?? CONFIG)))
  await page.route('https://ortus.test/api/v1/query*', (route) =>
    route.fulfill(over.ortus ?? json(ORTUS_BERLIN)),
  )
  await page.route('https://habitatus.test/api/v1/classify', (route) =>
    route.fulfill(over.habitatus ?? json(HABITATUS_OK)),
  )
  await page.route('https://hostus.test/v1/suggest*', (route) =>
    route.fulfill(over.hostus ?? json(HOSTUS_SUGGEST)),
  )
}

export { CONFIG, ERWARTETE_QUELLEN, ORTUS_BERLIN, HABITATUS_OK, HOSTUS_SUGGEST }
