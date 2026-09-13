# Legulus — Design

**Datum:** 2026-09-13
**Status:** abgestimmt, Implementierung noch nicht begonnen

---

## 1. Zweck und Abgrenzung

Legulus ist ein Frontend zur Bestimmung von EUNIS-Habitaten im Feld. Der Nutzer
erfasst einen **Plot** — Koordinate, Sample-ID, Artenliste mit Deckungsgraden —,
das Frontend besorgt die Standort-Kopfdaten und lässt den Plot klassifizieren.
Plots werden lokal gespeichert, wiedergefunden, nachjustiert und erneut
ausgewertet.

Legulus ist eine **Single-Page-Anwendung aus nativen ES-Modulen ohne
Build-Schritt**. Was im Repository liegt, ist das, was ausgeliefert wird.

### Die drei Dienste

Legulus rechnet nichts Fachliches selbst. Es orchestriert drei bestehende
Dienste:

| Dienst | Rolle | Endpunkt |
|---|---|---|
| **ortus** | Koordinate → Standort-Kopfdaten | `GET /api/v1/query?lon=&lat=` |
| **hostus** | Autosuggest für Pflanzennamen | `GET /v1/suggest` |
| **habitatus** | Plot → EUNIS-Habitat | `POST /api/v1/classify` |

Alle drei laufen unter `*.fieldworksdiary.org` und sind per CORS für die
Legulus-Origin freigegeben (geprüft an ortus: `access-control-allow-origin`
spiegelt die Origin, `vary: Origin`).

### Nicht Bestandteil

- **Keine fachliche Logik.** Legulus bildet keine ESy-Regel nach, interpretiert
  kein Ergebnis und korrigiert keines. Es stellt dar, was habitatus liefert.
- **Kein Offline-Betrieb.** Die App setzt Netz voraus. Gespeicherte Plots
  überleben das Neuladen, aber Kopfdaten-Abruf und Auswertung brauchen die
  Dienste. Ohne Verbindung gibt es Fehlermeldungen, keine halben Ergebnisse.
- **Keine serverseitige Persistenz.** Plots liegen im Local Storage des
  Browsers. Es gibt keine Synchronisierung, keine Konten, keinen Export
  (beides sind mögliche spätere Ausbaustufen).
- **Kein Regel-Trace.** Der Auswertungs-Anhang zeigt, was die heutige
  habitatus-Antwort hergibt (§6.3). Ein Bedingungs-Trace („Regel N15 wurde
  falsch, weil `#TC Trees` bei 24,65 % lag") setzt eine Erweiterung in
  habitatus voraus und ist ausdrücklich spätere Arbeit.

### Begriffe

Die erfasste Einheit heißt durchgängig **Plot** — nicht „Relevé", weil hier auf
Habitate und nicht auf Syntaxa gegangen wird, und nicht „Aufnahme", weil der
englische Begriff im EUNIS-/EVA-Umfeld der übliche ist und habitatus ihn
ebenfalls verwendet. Im Code heißt das Objekt `plot`; `record` bleibt der
Artzeile vorbehalten, weil die habitatus-Schnittstelle den Begriff so belegt.

---

## 2. Architektur

```
views/            plot-list.js      plot-form.js      result.js
      │              rendern gegen store, lösen Aktionen aus
      ▼
store.js          Zustand + subscribe; kennt weder DOM noch URL
      ▲
actions.js        orchestriert: Kopfdaten holen, auswerten, speichern
   ┌──┴────────────────┬───────────────────┐
   ▼                   ▼                   ▼
adapters/ortus.js  adapters/habitatus.js  adapters/hostus.js
   │
   ▼
header-map.js     deklarative Tabelle: ortus-Antwort → ESy-Kopfdaten
cover.js          Deckungsskalen ↔ Prozent
storage.js        Local Storage + Index
router.js         Hash-Routen → Ansicht
config.js         lädt /config.json (Basis-URLs)
```

Jede Einheit hat genau eine Aufgabe und ist einzeln testbar:

- **`store.js`** hält den Zustand und benachrichtigt Abonnenten. Kein DOM, kein
  `fetch`, keine URL — dadurch ohne Browser testbar.
- **`actions.js`** ist die einzige Stelle, die mehrere Adapter kennt. Ansichten
  rufen Aktionen, nie Adapter.
- **`adapters/*`** sprechen HTTP und geben ein internes Format zurück. Jede
  fremde Schnittstelle endet hier; kein anderes Modul kennt ein Feld aus einer
  fremden Antwort. Damit ist jeder Dienst durch einen Fake ersetzbar.
- **`header-map.js`** ist eine Tabelle, kein Code (§4.2). Eine neue Quelle in
  ortus ist eine Zeile, kein Umbau.

**Warum kein Shadow DOM, keine Web Components:** Die Kapselung würde genau das
erschweren, was hier streng sein muss — Label-Zuordnung über Grenzen hinweg,
Formularteilnahme und die axe-Läufe des A11y-Harness (§8).

---

## 3. Datenmodell

Ein Plot ist ein JSON-Objekt unter `legulus.plot.<sampleId>`; daneben liegt
`legulus.index` als schlanke Liste für Übersicht und Suche, damit diese nicht
alle Plots vollständig laden müssen.

```
{
  sampleId, createdAt, updatedAt,
  coordinate:   { lat, lon },                     // WGS 84, Dezimalgrad
  coordSource:  "manual" | "gps",                 // bei gps zusätzlich accuracyM
  accuracyM:    <Zahl> | null,
  header:       { Country, Coast_EEA, Dunes_Bohn, Ecoreg,
                  "Altitude (m)", DEG_LAT, DEG_LON, Dataset? },
  headerOrigin: { <feld>: "ortus" | "manual" | "missing" },
  headerEvidence: { seaRegion?, bohnUnit?, ecoName?, elevationSource? },
  scale:        "percent" | "bb-classic" | "bb-extended",
  species:      [ { name, conceptId?, cover, coverClass?, entry: "suggest"|"manual" } ],
  evaluation:   { at, request, response, status: "ok"|"error"|"stale" } | null
}
```

Vier Entscheidungen, die nicht offensichtlich sind:

**`headerOrigin` je Feld.** Ohne sie ist später nicht mehr unterscheidbar, ob
`N_COAST` aus ortus kam oder von Hand gesetzt wurde. Ändert sich eine Quelle
in ortus, ist „welche Plots muss ich nachbewerten" damit eine Filterung und
keine Archäologie.

**`cover` und `coverClass` nebeneinander.** Gespeichert wird immer der
Prozentwert — das ist, was habitatus gesehen hat — *und* die eingegebene
Klasse. Beim Wiederöffnen zeigt die Maske die Klasse; die Auswertung bleibt
reproduzierbar, auch wenn eine Umrechnungstabelle später korrigiert wird.

**`evaluation.request` vollständig mitgespeichert.** Der Anhang zeigt dann nicht
nur, was herauskam, sondern womit gefragt wurde. Ohne das ist ein Ergebnis nicht
nachvollziehbar, sobald der Plot einmal verändert wurde.

**`evaluation.status: "stale"`.** Jede Änderung an Koordinate, Kopfdaten,
Artenliste oder Deckung nach einer Auswertung setzt diesen Status. Das ist der
Normalfall im Nachjustier-Zyklus und muss sichtbar sein — sonst liest man ein
Ergebnis zu einer Artenliste, die es nicht erzeugt hat.

### Sample-ID

Die Sample-ID ist der Speicherschlüssel. Sie darf bei der Eingabe leer bleiben;
beim ersten Speichern vergibt die App dann `P-<JJJJ-MM-TT>-<lfd>`. Sie ist
umbenennbar, solange die neue ID frei ist. Eine Kollision ist ein Fehler mit dem
Angebot, den bestehenden Plot zu öffnen — **niemals** ein stilles Überschreiben.

---

## 4. Kopfdaten aus ortus

### 4.1 Ablauf

Der Abruf startet beim Verlassen der Koordinatenfelder bzw. nach dem GPS-Knopf
und läuft **parallel** zur Artenerfassung: Die Artenliste ist währenddessen voll
bedienbar. Der Auswerten-Knopf ist gesperrt, solange der Abruf läuft oder
Kopfdaten fehlen, und benennt den Grund.

### 4.2 Ableitungstabelle

`header-map.js` ist eine Datentabelle, keine Fallunterscheidung im Code:

| Headerfeld | ortus-Quelle | Pfad |
|---|---|---|
| `Country` | `gazetteer.admin.country_iso` | ISO → ESy-Name (§4.3) |
| `Ecoreg` | `ecoregions-2017` | Layer `ecoregions` → `ECO_ID` |
| `Altitude (m)` | `gazetteer.elevation.meters` | direkt |
| `Coast_EEA` | `coast-eea-2022` | Layer `coast_eea` → `coast_eea` |
| `Dunes_Bohn` | `bohn-dunes-2019` | Layer `dunes_bohn` → `dunes_bohn` |
| `DEG_LAT` | `coordinate.y` | direkt |
| `DEG_LON` | `coordinate.x` | direkt |

`coast-eea-2022` und `bohn-dunes-2019` liefern die Werte bereits im
ESy-Vokabular (`ATL_COAST`, `BAL_COAST`, `MED_COAST`, `N_COAST`; `Y_DUNES`,
`N_DUNES`) — es ist keine Übersetzung nötig. Als Beleg mit angezeigt, nicht als
Eingabe: `sea_region`, `bohn_unit`, `ECO_NAME` und die Elevations-Quelle.

### 4.3 Ländernamen

Habitatus vergleicht `Country` als **exakte Zeichenkette** gegen das
ESy-Vokabular: `Germany`, nicht `Deutschland`, nicht `DE`; `Czech Republic`,
nicht `Czechia`; `United Kingdom`, nicht `Britain`. Legulus führt dafür eine
Kopie der 52 Zeilen aus `habitatus/data/esy-country-names.csv` als
JS-Modul (`iso_alpha2` → `esy_country`).

Liegt der ISO-Code außerhalb dieser 52 — ein Plot außerhalb Europas —, ist das
**kein** stiller Fehler: `Country` erhält `missing` und muss von Hand gesetzt
werden. Andernfalls würde jede länderabhängige Regel lautlos nie feuern.

### 4.4 Fehlende Quellen

Eine Quelle kann für eine Koordinate **gar kein Feature** liefern; sie fehlt
dann komplett in `results`. Nachgewiesen an einem Punkt in der Ostsee
(12.45/54.45): `ecoregions-2017` taucht dort nicht auf, `ECO_ID` ist nicht
ableitbar.

Ein solches Feld erhält `headerOrigin: "missing"`, wird in der Maske
hervorgehoben und blockiert die Auswertung. Es gibt **keine erfundenen
Defaults**.

Die Begründung liegt in habitatus: Version 1.2 zwingt vor jeder logischen
Auswertung alle unauflösbaren Werte auf 0 und wertet danach zweiwertig aus. Ein
geratener Wert erzeugt dort also kein „unbekannt", sondern still ein falsches
Ergebnis. Die Maske ist die einzige Stelle im ganzen Weg, an der das auffallen
kann.

Manuell gesetzte Werte kommen aus dem jeweiligen Vokabular (Dropdown), für
`Ecoreg` aus einem Zahlenfeld. Auch ein von ortus gelieferter Wert bleibt
übersteuerbar; das setzt die Herkunft auf `manual`.

---

## 5. Artnamen und Deckung

### 5.1 Namen

Autosuggest läuft gegen `hostus GET /v1/suggest`, gefiltert auf Treffer mit
Euro+Med-Entsprechung. Übernommen wird der **akzeptierte Euro+Med-Name**;
Synonyme werden beim Übernehmen aufgelöst. Legulus sendet `backbone:
"euro+med"` und schneidet EuroSL-Zählersuffixe ab (`Festuca ovina.1` →
`Festuca ovina`), weil der Name sonst nichts trifft.

**Freitext bleibt zulässig** und wird als `entry: "manual"` markiert. Ohne ihn
sind die ESy-Konventionen nicht eingebbar, die kein Backbone führt:
Gattungsfunde als `Quercus species` und Aggregate in ESy-Schreibweise.

Ein zweites Mal derselbe Name wird **gewarnt, aber nicht zusammengeführt**.
Habitatus vereinigt die Deckungen ohnehin nach Jennings-Fischer; eine stille
Zusammenführung im Frontend würde genau diesen Schritt verfälschen.

Bedienung des Eingabefeldes: ARIA-Combobox-Pattern (`role="combobox"`,
`aria-expanded`, `aria-controls`, `aria-activedescendant`, Listbox mit
`role="option"`), 200 ms entprellt, `AbortController` gegen überholende
Antworten, vollständig per Tastatur bedienbar (Pfeiltasten, Enter übernimmt,
Escape schließt).

### 5.2 Deckung

Habitatus nimmt ausschließlich Prozent, `0 < c ≤ 100`, und rechnet bewusst keine
Skala um. Legulus bietet drei Eingabemodi, **je Plot umschaltbar** und in
`scale` mitgespeichert:

| Klasse | `bb-classic` | `bb-extended` |
|---|---|---|
| `r` | 0,1 | 0,1 |
| `+` | 0,5 | 0,5 |
| `1` | 2,5 | 2,5 |
| `2m` | — | 4 |
| `2a` | — | 10 |
| `2b` | — | 20 |
| `2` | 15 | — |
| `3` | 37,5 | 37,5 |
| `4` | 62,5 | 62,5 |
| `5` | 87,5 | 87,5 |

Dazu `percent` als direkte Eingabe.

Die Umrechnung ist keine Formalie: Deckungen werden von habitatus nach
Jennings-Fischer vereinigt, nicht addiert — 10 %, 9 % und 8 % ergeben 24,65 %
und nicht 27 %, und kippen damit ein `GR 25`.

**Skalenwechsel:** Prozent ist immer die gespeicherte Wahrheit. Der Umschalter
wechselt nur das Eingabewerkzeug; bestehende Zeilen behalten ihren Prozentwert.
Existiert ihre Klasse in der neuen Skala nicht, zeigt die Zeile den Prozentwert
und verliert das Klassenetikett. Sie wird **nicht** auf eine nächstgelegene
Klasse gerundet — das würde eine Messung verändern, die so nie gemacht wurde.

---

## 6. Auswertung

### 6.1 Request

Der Request wird **explizit aufgebaut**, nie aus dem Plot-Objekt durchgereicht:
habitatus dekodiert mit `DisallowUnknownFields` und weist jedes unbekannte Feld
ab. Alle Headerwerte sind Strings (`map[string]string`), Zahlen also
stringifiziert.

```json
{
  "backbone": "euro+med",
  "records": [ { "name": "Festuca ovina", "cover": 37.5 } ],
  "header": {
    "Country": "Germany", "Coast_EEA": "N_COAST", "Dunes_Bohn": "N_DUNES",
    "Ecoreg": "654", "Altitude (m)": "36",
    "DEG_LAT": "52.52", "DEG_LON": "13.405",
    "Dataset": "<sampleId>"
  }
}
```

`Dataset` ist bei habitatus optional und wird mit der Sample-ID belegt, damit
Anfrage und Plot in beiden Systemen denselben Namen tragen.

### 6.2 Ergebniszeile

EUNIS-Code, oder `?` bzw. `+` — beide **ausgeschrieben**, weil die Zeichen
allein nichts sagen: `?` heißt „keine Regel trifft", `+` heißt „mehrdeutig, auch
nach dem Prioritätsabstieg".

### 6.3 Anhang

Ein `<details>`-Block unter der Ergebniszeile mit:

- **allen Treffern** — Code, Priorität, Regelvariante (`N15`, `N15!`, `N15!!`);
  habitatus liefert die vollständige Liste und vermerkt in `truncated_at_10`,
  wo das Original abgeschnitten hätte
- **der Gewinnerbegründung** entlang der v1.2-Logik: kein Treffer → `?`; genau
  ein Treffer → dieser; sonst erste Prioritätsstufe (absteigend von 8) mit genau
  einem Treffer; sonst `+`
- **dem Auflösungsbericht je Name**: Eingabe → nach Backbone → final, plus
  „unaufgelöst". Unaufgelöste Namen werden ausdrücklich **nicht** als folgenlos
  dargestellt: sie gehören zu keiner Gruppe, zählen aber in die Gesamtdeckung
  und können damit Dominanztests kippen
- **dem abgesetzten Request** und `versions` (Regelwerk, Backbone-Tabelle,
  Auswertungsmodus)

### 6.4 Fehler

| Fall | Behandlung |
|---|---|
| `400` von habitatus | Fehlermeldung **wörtlich** anzeigen — sie benennt das Feld. Nicht übersetzen, nicht verschlucken. |
| `5xx` | Als Dienstfehler kennzeichnen, nicht als Eingabefehler. Wiederholen anbieten. |
| Netz-/Preflight-Fehler | Als wiederholbar kennzeichnen, vom `5xx` unterschieden. |
| Abbruch durch neue Anfrage | Stillschweigend verwerfen. |

Der Plot bleibt in **jedem** Fehlerfall gespeichert und bearbeitbar;
`evaluation.status` wird `"error"`, die Fehlermeldung bleibt am Plot.

---

## 7. Bildschirme

Zwei Routen:

- `#/plots` — Liste und Suche
- `#/plot/<sampleId>` — Maske **mit** Ergebnispanel darunter

Das Ergebnis bekommt bewusst **keinen** eigenen Bildschirm. Der Zyklus lautet
„Ergebnis ansehen → Art korrigieren → erneut auswerten"; auf getrennten
Bildschirmen wären das drei Navigationen je Runde. Auf einem Bildschirm ist es
ein Knopfdruck, und man sieht beim Ändern unmittelbar, welches Ergebnis dadurch
veraltet.

### 7.1 Maske

Vier Abschnitte untereinander:

1. **Standort** — Sample-ID, Länge/Breite, GPS-Knopf, Paste-Handler für
   Koordinatenpaare. GPS-Knopf und Paste-Handler werden aus der
   ortus-Testkonsole übernommen: `navigator.geolocation.getCurrentPosition` mit
   `{ enableHighAccuracy: true, timeout: 10000 }`, `toFixed(6)`, Knopf während
   der Abfrage gesperrt, Fehler des Browsers im Klartext. **Ergänzt** um die
   Anzeige der gemeldeten `accuracy_m`: im Feld ist der Unterschied zwischen
   8 m und 800 m entscheidend, und der Browser verschweigt ihn sonst.
2. **Kopfdaten** — die sieben Felder mit ihrer Herkunft. `ortus`-Werte
   schreibgeschützt, aber übersteuerbar; `missing` hervorgehoben und blockierend;
   Belege als Nebentext; Ladezustand sichtbar, ohne die Artenliste zu blockieren.
3. **Arten** — Zeilen aus Name und Deckung, darüber der Skalenumschalter (§5).
4. **Auswertung** — Knopf, Ergebniszeile, Anhang (§6).

### 7.2 Liste und Suche

Gespeist aus `legulus.index`. Je Zeile: Sample-ID, Datum, Koordinate,
Artenzahl, Ergebnis (Code / `?` / `+` / „nicht ausgewertet" / „veraltet" /
„Fehler"). Freitextfilter über Sample-ID, EUNIS-Code und Artnamen, dazu ein
Statusfilter. Klick öffnet die Maske.

---

## 8. Barrierefreiheit

Verbindlich ist der Skill `web-accessibility-audit` aus
`jobrunner/claude-skills`, eingebunden als Submodul `third_party/claude-skills`
mit Symlink unter `.claude/skills/` — dasselbe Muster wie in ortus und
habitatus. Ziel ist **WCAG 2.2 AA**; die Regeln des Skills haben Vorrang vor
gestalterischen Festlegungen.

**Layer 1** — `a11y-grep.sh` auf die geänderten Dateien, mit `--strict`.
**Layer 2 entfällt begründet:** Die Framework-Linter des Skills zielen auf
JSX/Vue/Angular/Svelte; hier gibt es keine Templates. Ersatz ist der
`--strict`-Lauf.
**Layer 3** — `axe-audit.mjs` via Playwright gegen den laufenden Container über
beide Routen, **inklusive geöffnetem `<details>` und geöffneter
Autosuggest-Liste** (sonst prüft der Lauf genau die schwierigen Zustände nicht).
`serious`/`critical` bricht ab.

Dazu die manuellen Durchgänge, die kein Werkzeug ersetzt: Tab-Durchlauf (Fokus
sichtbar, keine Falle, Reihenfolge wie die Lesereihenfolge), 200 % Zoom,
`prefers-reduced-motion: reduce`.

Zwei Stellen sind vorab entschieden, weil sie erfahrungsgemäß durchfallen:

- Die Autosuggest-Liste ist ein vollständiges Combobox-Pattern (§5.1), kein
  `<div>` mit Klick-Handlern.
- Statuswechsel — Kopfdaten geladen, Auswertung fertig, Fehler — werden über
  `aria-live` angesagt und nicht nur farblich dargestellt.

---

## 9. Auslieferung

`nginx:alpine`, der das Quellverzeichnis unverändert ausliefert. Ohne Build gibt
es keinen Unterschied zwischen dem Geschriebenen und dem Ausgelieferten.

**Laufzeitkonfiguration.** Die drei Basis-URLs stehen **nicht** im Quelltext,
sonst bräuchte jede Umgebung ein eigenes Image. Die App holt beim Start
`/config.json`; ein Entrypoint schreibt diese Datei aus `ORTUS_BASE_URL`,
`HABITATUS_BASE_URL` und `HOSTUS_BASE_URL` (Vorgaben: die drei
`*.fieldworksdiary.org`). Dieselben Werte erzeugen die `connect-src`-Liste der
CSP — sonst blockiert die eigene Richtlinie genau die Dienste, die man gerade
konfiguriert hat.

**Härtung.** Prozess als Nicht-Root. `Content-Security-Policy` mit
`default-src 'self'` und **ohne** `unsafe-inline` — deshalb liegen Skripte und
Styles in eigenen Dateien, nicht inline. Dazu `X-Content-Type-Options: nosniff`
und `Referrer-Policy: no-referrer`.

**Caching.** `no-cache` für HTML und `/config.json`; ETag-basierte
Revalidierung für die Module. Ohne Build gibt es keine Hashes in Dateinamen,
`immutable` wäre also schlicht falsch.

---

## 10. Tests und Gates

### 10.1 Unit-Tests

Mit `node:test` — im Standard enthalten, keine Testabhängigkeit. Ohne Browser
wird geprüft, was ohne Browser prüfbar ist, und das ist der überwiegende Teil:

| Modul | Geprüft wird |
|---|---|
| `cover.js` | beide Skalen in beide Richtungen, Grenzwerte, Zurückweisung von 0 und > 100 |
| `header-map.js` | gegen eingefrorene echte ortus-Antworten (§10.2) |
| `storage.js` | Index, Umbenennen, Kollision, `stale`-Übergang |
| `adapters/*` | gegen gefälschtes `fetch`, inkl. `400` / `5xx` / Netzfehler / Abbruch |

### 10.2 Fixtures

Echte, eingefrorene ortus-Antworten unter `testdata/ortus/`, mindestens:

| Fixture | Prüft |
|---|---|
| Berlin (13.405/52.52) | der vollständige Normalfall |
| Sylt (8.31/54.90) | `ATL_COAST`, Küstenbeleg `sea_region` |
| Darß/Ostsee (12.45/54.45) | **fehlende** `ecoregions-2017` → `missing` |
| Punkt außerhalb der 52 ESy-Länder | `Country` → `missing` |

### 10.3 Smoke gegen die echten Dienste

`make smoke` fragt die echten Dienste mit denselben Koordinaten ab und prüft,
ob die Ableitung weiterhin sieben Felder liefert. Es läuft **nicht** in der CI —
es braucht Netz und fremde Dienste —, sondern auf Zuruf. Es ist das, was
Schema-Drift in ortus sichtbar macht, bevor die Nutzer sie merken.

### 10.4 `make`-Ziele

| Ziel | Wirkung |
|---|---|
| `test` | Unit-Suite (`node:test`) |
| `a11y` | Layer 1 `--strict` + Layer 3 (axe gegen den laufenden Container) |
| `smoke` | Abgleich gegen die echten Dienste |
| `serve` | lokaler Statik-Server ohne Docker |
| `docker` | Image bauen und starten |
| `check` | `test` + `a11y` — das Pre-Merge-Gate |

---

## 11. Offene Punkte

| Punkt | Zustand |
|---|---|
| habitatus-Deployment | wird unter `habitatus.fieldworksdiary.org` bereitgestellt; **Preflight prüfen**: `POST` mit `Content-Type: application/json` erfordert eine `OPTIONS`-Antwort mit `Access-Control-Allow-Headers: Content-Type` |
| hostus-Deployment | wird unter `hostus.fieldworksdiary.org` bereitgestellt; `GET /v1/suggest` war zuletzt ein SP0-Stub — die genaue Antwortform legt den Adapter fest |
| Regel-Trace | spätere habitatus-Erweiterung; die UI-Fläche im Anhang (§6.3) ist dafür vorgesehen |
| Export, Sync, Offline | ausdrücklich spätere Ausbaustufen |
