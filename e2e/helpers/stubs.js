// Die Oberflächentests laufen nie gegen die echten Dienste: sie wären
// langsam, ändern sich ohne unser Zutun und sagen nichts über die
// Oberfläche. Was die Dienste tun, prüfen die Adapter-Tests und make smoke.
const CONFIG = {
  ortusBaseUrl: 'https://ortus.test',
  habitatusBaseUrl: 'https://habitatus.test',
  hostusBaseUrl: 'https://hostus.test',
  situsBaseUrl: 'https://situs.test',
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
    // Die botanische Region (WGSRPD Level 3). Sie geht als area an hostus,
    // damit die Vorschläge das Gebiet des Fundorts kennen.
    { source_id: 'wgsrpd-level3', features: [{ layer: 'botanical_countries', properties: { LEVEL3_COD: 'GER', LEVEL3_NAM: 'Germany' } }] },
    { source_id: 'coast-eea-2022', features: [{ layer: 'coast_eea', properties: { coast_eea: 'N_COAST', sea_region: '' } }] },
    { source_id: 'bohn-dunes-2019', features: [{ layer: 'dunes_bohn', properties: { dunes_bohn: 'N_DUNES', bohn_unit: '' } }] },
  ],
}

// Nachgebildet nach einer echten Antwort von situs zu R1A. Die Felder
// heißen wie dort: name_en, description.value, species nach Rolle,
// syntaxa mit rank und author.
const SITUS_R1A = {
  typology: 'eunis@2021',
  code: 'R1A',
  level: 3,
  name_en: 'Semi-dry perennial calcareous grassland (meadow steppe)',
  // situs liefert die deutschen Felder additiv, wenn lang=de gefragt wird;
  // name_en bleibt dabei gesetzt.
  name_de: {
    value: 'Submediterran-subkontinentaler Halbtrockenrasen',
    vernacular: 'Kalk-Halbtrockenrasen',
    provenance: 'situs',
    source: 'situs@0.11.1',
  },
  description: {
    value: 'Species-rich semi-dry grassland on base-rich soils.',
    provenance: 'official',
    source: 'floraveg:eunis-habitat-factsheets:2021-06-01',
  },
  description_de: {
    value: 'Artenreiche Halbtrockenrasen basenreicher Böden.',
    provenance: 'situs',
    source: 'situs@0.11.1',
  },
  species: {
    diagnostic: [{ concept_id: 'wcvp:1', verbatim_name: 'Bromus erectus', role: 'diagnostic', fidelity: 21 }],
    constant: [{ concept_id: 'wcvp:2', verbatim_name: 'Festuca rupicola', role: 'constant', constancy: 18 }],
    dominant: [{ concept_id: 'wcvp:3', verbatim_name: 'Carex humilis', role: 'dominant', constancy: 12 }],
  },
  syntaxa: [
    { id: 'XD01', rank: 'alliance', name: 'Cirsio-Brachypodion pinnati', author: 'Hadač et Klika 1944', parent_id: 'XD', eea_code: 'FES-01', source: 'evc' },
  ],
  crosswalks: [],
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

// Wie die echte Antwort: die Kennungen tragen nie das Präfix "eurosl",
// der Euro+Med-Name steht in target_space_name. Der zweite Treffer liegt
// außerhalb des Gebiets und führt einen abweichenden eigenen Namen —
// beides erscheint als Hinweis unter dem Vorschlag.
const HOSTUS_SUGGEST = {
  backbone_versions: { cdm: '2026-08-02', eurosl: '2024-11-03' },
  results: [
    { concept_id: 'cdm:concept:aaa', display: 'Festuca ovina', canonical: 'Festuca ovina', target_space_name: 'Festuca ovina', rank: 'SPECIES', status: 'ACCEPTED', in_area: true, score: -6 },
    { concept_id: 'wcvp:concept:bbb', display: 'Festuca rubra', canonical: 'Festuca rubra', target_space_name: 'Festuca rubra subsp. arenaria', rank: 'SPECIES', status: 'ACCEPTED', in_area: false, score: -6.1 },
  ],
}

// over.<dienst> ist eine fertige Antwort im Format von route.fulfill —
// damit lässt sich ein Fehlerfall stellen. Ohne Angabe kommt die Vorgabe
// als JSON mit Status 200.
function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

async function stub(page, muster, eigen, vorgabe) {
  await page.route(muster, (route) => route.fulfill(eigen ?? json(vorgabe)))
}

export async function stubServices(page, over = {}) {
  await stub(page, '**/config.json', over.config && json(over.config), CONFIG)
  await stub(page, 'https://ortus.test/api/v1/query*', over.ortus, ORTUS_BERLIN)
  await stub(page, 'https://habitatus.test/api/v1/classify', over.habitatus, HABITATUS_OK)
  await stub(page, 'https://hostus.test/v1/suggest*', over.hostus, HOSTUS_SUGGEST)
  await stub(page, 'https://situs.test/v1/habitat-type/**', over.situs, SITUS_R1A)
}

export { CONFIG, ERWARTETE_QUELLEN, ORTUS_BERLIN, HABITATUS_OK, HOSTUS_SUGGEST, SITUS_R1A }
