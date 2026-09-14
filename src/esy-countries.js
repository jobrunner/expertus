// ERZEUGT von scripts/gen-countries.mjs — nicht von Hand bearbeiten.
// Quelle: habitatus/data/esy-country-names.csv (52 Zeilen).
//
// Habitatus vergleicht Country als exakte Zeichenkette. "Germany", nicht
// "Deutschland", nicht "DE"; "Czech Republic", nicht "Czechia". Jede
// Abweichung lässt die zugehörigen Regeln stumm nie wahr werden.

export const ESY_COUNTRIES = {
  AL: "Albania",
  AD: "Andorra",
  AM: "Armenia",
  AT: "Austria",
  BY: "Belarus",
  BE: "Belgium",
  BA: "Bosnia-Herzegovina",
  BG: "Bulgaria",
  CA: "Canada",
  HR: "Croatia",
  CY: "Cyprus",
  CZ: "Czech Republic",
  DK: "Denmark",
  EE: "Estonia",
  FO: "Faroe Islands",
  FI: "Finland",
  FR: "France",
  GE: "Georgia",
  DE: "Germany",
  GR: "Greece",
  HU: "Hungary",
  IS: "Iceland",
  IE: "Ireland",
  IT: "Italy",
  KZ: "Kazakhstan",
  XK: "Kosovo",
  LV: "Latvia",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  MD: "Moldova",
  MC: "Monaco",
  ME: "Montenegro",
  NL: "Netherlands",
  MK: "North Macedonia",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RU: "Russian Federation",
  SM: "San Marino",
  RS: "Serbia",
  SK: "Slovak Republic",
  SI: "Slovenia",
  ES: "Spain",
  SJ: "Svalbard and Jan Mayen Is",
  SE: "Sweden",
  CH: "Switzerland",
  TR: "Turkey",
  UA: "Ukraine",
  GB: "United Kingdom",
}

export const ESY_COUNTRY_NAMES = Object.values(ESY_COUNTRIES).sort()

export function esyCountryFor(iso) {
  if (typeof iso !== 'string' || iso === '') return null
  return ESY_COUNTRIES[iso.toUpperCase()] ?? null
}
