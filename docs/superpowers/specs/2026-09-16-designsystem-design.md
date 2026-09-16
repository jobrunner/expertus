# Design-System für die fieldworksdiary-Dienste

Stand: 2026-09-16

## Ausgangslage

Fünf Dienste bringen je ein eigenes Frontend mit, keine zwei davon teilen
Code:

| Projekt | Form | Umfang | Palette | Dark Mode |
|---|---|---|---|---|
| Ortus | Go-String-Konstante in `frontend.go` | 2007 Zeilen | Blau `#2563eb` | nein |
| Tempus | `index.html` per `go:embed` | 2344 Zeilen | Blau `#2563eb` | nein |
| Situs | `explorer.html` per `go:embed` | 487 Zeilen | Grün `#2d6a4f` | ja |
| Hostus | `assets/style.css` per `go:embed` | 189 Zeilen | neutral | nein |
| Expertus | `styles.css`, von nginx ausgeliefert | 75 Zeilen | keine | nein |

Ortus und Tempus führen dasselbe System zweimal: identische Token-Namen,
identische Werte, identische Komponenten — entstanden durch Kopieren, seither
getrennt gepflegt. Tempus hat inzwischen ein `--text-disabled`, das Ortus
fehlt; Ortus hat einen Accordion, den Tempus nicht kennt. Die Schere geht mit
jeder Änderung weiter auf.

Gleichzeitig arbeiten Hostus und Expertus auf einem höheren
Barrierefreiheitsniveau als Ortus und Tempus. Expertus dokumentiert 7:1 für
Fließtext, Hostus trennt `--control-line` (≥ 3:1, WCAG 1.4.11) von der
dekorativen `--line`. Ortus' und Tempus' `--text-muted: #64748b` erreicht auf
dem Seitenhintergrund nur 4.55:1.

## Ziel

Ein gemeinsames Design-System, das die Dienste als Familie erkennbar macht,
das höhere Barrierefreiheitsniveau zum Standard erhebt und die Duplizierung
zwischen Ortus und Tempus auflöst.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Auslieferung | Go-Modul `github.com/jobrunner/fieldworksdiary-designsystem` |
| Umfang | Tokens + Basiskomponenten; Domänenspezifisches bleibt lokal |
| Kontrast | AAA für Fließtext (7:1); Bedienelement-Ränder ≥ 3:1 |
| Markenbild | eine gemeinsame Akzentfarbe für alle fünf Dienste |
| Dark Mode | ja, über `prefers-color-scheme`; kein Umschalter, keine Persistenz |
| Git-Submodule | ausgeschlossen — nicht automatisch aktualisierbar |

Die Submodul-Variante scheidet aus, weil Dependabot und Renovate Submodule
nicht verlässlich aktualisieren, `go.mod` dagegen schon. Ortus, Tempus und
Hostus haben bereits eine `dependabot.yml`; Situs und Expertus bekommen eine.

Damit ein einziger Verteilmechanismus für alle fünf Dienste reicht, wird
Expertus von nginx auf einen eigenen Go-Server umgestellt (siehe unten).

## Aufbau des Repositories

```
fieldworksdiary-designsystem/
├── go.mod                  module github.com/jobrunner/fieldworksdiary-designsystem
├── designsystem.go         //go:embed css/*.css → TokensCSS(), BaseCSS(), CSS()
├── css/
│   ├── tokens.css          Farben (hell und dunkel), Typografie, Abstände,
│   │                       Radien, Schatten
│   └── base.css            Reset, Fokus, Formularelemente, Buttons, Card,
│                           Tabs, Badge, Tabelle, Spinner, Fehlerbox,
│                           sr-only, reduced-motion, Breakpoints
├── contrast_test.go        prüft jeden Farbwert programmatisch
├── demo/index.html         Referenzseite, alle Komponenten in hell und dunkel
└── docs/                   Anwendungsregeln und Migrationsleitfaden
```

Die Go-Schnittstelle bleibt bewusst klein: drei Funktionen, die Bytes liefern.
Kein Templating, keine Handler, keine Meinung darüber, wie ein Dienst sein
HTML baut.

```go
package designsystem

//go:embed css/tokens.css
//go:embed css/base.css

func TokensCSS() []byte  // nur die Variablen
func BaseCSS() []byte    // Reset und Komponenten, setzt Tokens voraus
func CSS() []byte        // beides, in dieser Reihenfolge
```

Ein Dienst liefert das Ergebnis unter einer eigenen Route aus, üblicherweise
`/assets/designsystem.css`, und verlinkt es aus seinem HTML. Wer sein CSS
heute inline in einem `<style>`-Block hält, kann `CSS()` auch dort einsetzen.

## Farb-Tokens

Alle Werte sind gegen die **Kartenfläche** geprüft, nicht gegen den
Seitenhintergrund — die Karte ist die strengere Bezugsfläche. Die Werte in
`contrast_test.go` sind die verbindliche Quelle; die folgende Tabelle gibt sie
wieder.

### Hell

| Token | Wert | Kontrast auf `#ffffff` | Anforderung |
|---|---|---|---|
| `--bg` | `#f8fafc` | — | Seitenhintergrund |
| `--card` | `#ffffff` | — | Kartenfläche |
| `--text` | `#1e293b` | 14.6:1 | ≥ 7:1 |
| `--text-muted` | `#475569` | 7.6:1 | ≥ 7:1 |
| `--accent` | `#1e40af` | 8.7:1 (weißer Text darauf) | ≥ 7:1 |
| `--success` | `#166534` | 7.1:1 | ≥ 7:1 |
| `--error` | `#991b1b` | 8.3:1 | ≥ 7:1 |
| `--warning` | `#92400e` | 7.1:1 | ≥ 7:1 |
| `--text-disabled` | `#475569` | 7.6:1 | ≥ 7:1 |
| `--control-line` | `#767676` | 4.5:1 | ≥ 3:1 |
| `--border` | `#e2e8f0` | dekorativ | ausgenommen |

`--text-disabled` stammt aus Tempus und fehlt Ortus — ein Beispiel für die
Drift, die das gemeinsame Modul beendet. Es erhält denselben Wert wie
`--text-muted`: ein deaktiviertes Bedienelement darf nicht durch schwachen
Kontrast erkennbar gemacht werden, sondern durch `aria-disabled` und
Cursor.

### Dunkel

| Token | Wert | Kontrast auf `--card` | Anforderung |
|---|---|---|---|
| `--bg` | `#0f172a` | — | Seitenhintergrund |
| `--card` | `#1e293b` | — | Kartenfläche |
| `--text` | `#f1f5f9` | 13.4:1 | ≥ 7:1 |
| `--text-muted` | `#b4c0ce` | 7.9:1 | ≥ 7:1 |
| `--accent` | `#93c5fd` | 8.1:1 | ≥ 7:1 |
| `--success` | `#86efac` | 10.4:1 | ≥ 7:1 |
| `--error` | `#fca5a5` | 7.7:1 | ≥ 7:1 |
| `--warning` | `#fcd34d` | 10.2:1 | ≥ 7:1 |
| `--text-disabled` | `#b4c0ce` | 7.9:1 | ≥ 7:1 |
| `--control-line` | `#8695a8` | 4.8:1 | ≥ 3:1 |
| `--border` | `#334155` | dekorativ | ausgenommen |

Drei Konsequenzen sind erwähnenswert:

**Sekundärtext wird dunkler.** Ortus' und Tempus' `#64748b` (4.55:1) weicht
`#475569` (7.6:1). Das ist die sichtbarste Änderung im hellen Thema.

**Das Primärblau wird satter.** `#2563eb` trägt weißen Text nur mit 5.2:1;
`#1e40af` erreicht 8.7:1. Buttons und Links bleiben blau, wirken aber
kräftiger.

**Karten brauchen im Dunkeln einen Rand.** `--card: #1e293b` steht gegen
`--bg: #0f172a` nur bei 1.22:1. Der `box-shadow`, der die Karte im hellen
Thema vom Hintergrund abhebt, leistet das auf dunklem Grund nicht. Im dunklen
Thema tritt deshalb `border: 1px solid var(--border)` an die Stelle des
Schattens. Dieselbe Regel gilt für jede andere Fläche, die sich allein durch
Helligkeit abheben soll.

`--border` und `--control-line` bleiben getrennt. Die Begründung übernimmt
`tokens.css` im Wortlaut aus Hostus: WCAG 1.4.11 fordert Kontrast für die
Begrenzung, die ein **Bedienelement** erkennbar macht; dekorative Trennlinien
sind ausgenommen und dürfen zart bleiben.

## Weitere Tokens

Typografie, Abstände, Radien und Schatten folgen den Werten, die Ortus und
Tempus bereits gemeinsam verwenden — sie haben sich bewährt und ihre
Übernahme hält die Migration dieser beiden Dienste klein.

- Schriftfamilie: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Monospace: `'SF Mono', Monaco, ui-monospace, monospace`
- Zeilenhöhe `1.5`, Basisgröße `1rem`
- `--radius: 8px`, kleinerer Radius `4px` für eingebettete Flächen
- `--shadow: 0 1px 3px rgba(0,0,0,0.1)` (nur im hellen Thema wirksam)
- Breakpoints bei `640px` und `1024px`, mobile-first

## Komponenten in `base.css`

Aufgenommen wird, was mindestens zwei Dienste brauchen:

- Reset (`box-sizing`, Margin-Reset), `body`, `.container`
- Sichtbarer Fokusring auf allen fokussierbaren Elementen
- `label`, `input`, `select`, `textarea` samt Fokuszustand und Platzhalter
- `.btn`, `.btn-secondary`, `.btn-row`, Zustände `hover`/`disabled`/`focus-visible`
- `.card`, `.card-title`
- `.tabs`, `.tab` mit `aria-selected`-Zustand
- `.badge` samt Erfolgs- und Fehlervariante
- Tabellen-Grundlayout und `.table-wrap` für waagerechtes Rollen
- `.spinner`, `.loading`
- `.error` als Meldungsbox
- `.sr-only`, `.skip-link`
- `@media (prefers-reduced-motion: reduce)`

Nicht aufgenommen wird Domänenspezifisches: `.weather-panel` und
`.provider-row` bleiben in Tempus, `.source-card` und `.gazetteer-block` in
Ortus, `.hits` in Situs, die Statusflächen in Hostus. Diese Komponenten
greifen auf die Tokens zu, leben aber weiter im jeweiligen Projekt.

Mindestgrößen für Bedienelemente: 44 × 44 CSS-Pixel wo möglich, 24 × 24 als
harte Untergrenze (WCAG 2.2, SC 2.5.8). Expertus' heutige Regel wird damit
zum Standard.

## Prüfung im Design-System-Repo

`contrast_test.go` berechnet die relative Leuchtdichte nach WCAG und prüft
jedes Farbpaar:

- Text-Tokens gegen `--card` und `--bg`, beide Themen, ≥ 7:1
- `--control-line` gegen `--card` und `--bg`, beide Themen, ≥ 3:1
- weißer Text auf `--accent` im hellen Thema, ≥ 7:1

Der Test liest die Werte aus `css/tokens.css`, nicht aus einer zweiten Liste
im Testcode — sonst prüft er eine Kopie statt der Wahrheit. Ein Farbwert, der
das Niveau unterschreitet, bricht den Build hier, nicht erst in fünf
Anwendungen.

Die Demo-Seite unter `demo/` zeigt jede Komponente in beiden Themen und dient
der visuellen Abnahme.

## Expertus: Umstellung auf Go

Expertus wird heute von nginx ausgeliefert, mit Konfiguration aus
Umgebungsvariablen. Damit es dasselbe Go-Modul nutzen kann wie die anderen
vier, tritt ein eigener Go-Server an die Stelle von nginx. Der Server muss
genau das leisten, was `docker/nginx.conf` und `docker/entrypoint.sh` heute
tun:

| heute | künftig |
|---|---|
| `entrypoint.sh` schreibt `config.json` aus `ORTUS_BASE_URL`, `HABITATUS_BASE_URL`, `HOSTUS_BASE_URL` | Handler `/config.json` rendert dieselben drei Werte aus der Umgebung |
| CSP mit `connect-src` aus denselben Variablen gebaut | Middleware baut denselben CSP-String |
| `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control`, `etag` je Location | dieselben Header in einem Middleware-Block |
| `try_files $uri $uri/ /index.html` | `http.FileServer` über `embed.FS`, Fallback auf `index.html` |

Mit berührt:

- `Dockerfile` — mehrstufiger Go-Build statt nginx-Image
- `docker/nginx.conf` und `docker/entrypoint.sh` — entfallen
- `playwright.config.js` — `webServer.command` startet das Binary statt
  `python3 -m http.server`
- `Makefile` — `serve` und `smoke` entsprechend
- `.github/workflows/` — Go-Toolchain, `go test`

Der Grundsatz, den der Dockerfile heute festhält — das Ausgelieferte ist
identisch mit dem Repository-Inhalt — bleibt gewahrt: `go:embed` legt die
Dateien unverändert ins Binary, es findet weiterhin keine Transformation
statt. Der Kommentar wird entsprechend neu formuliert.

## Migrationsreihenfolge

Jeder Schritt ist für sich abgeschlossen und überprüfbar.

1. **Design-System-Repo** anlegen: Tokens, `base.css`, `contrast_test.go`,
   Demo-Seite. Ohne Konsumenten prüfbar, visuelle Abnahme an der Demo-Seite.
2. **Tempus** — kürzester Weg, weil das CSS bereits in einer eigenen
   `index.html` per `go:embed` liegt. Dient als Referenzmigration.
3. **Ortus** — dabei die Go-String-Konstante in `frontend.go` auf
   `go:embed index.html` umstellen. Die Datei schrumpft um rund 700 Zeilen.
4. **Hostus** — behält seine Statusflächen als lokale Ergänzung.
5. **Situs** — der aufwendigste Schritt. Nicht nur die Palette wechselt: der
   Explorer benutzt mit `.panel`, `.globals`, `.row` ein eigenes
   Klassenvokabular, das sich nicht eins zu eins auf `.card`, `.form-group`
   und `.btn-row` abbilden lässt. Hier wird Markup umgeschrieben, nicht nur
   CSS ersetzt. Sein Dark Mode kommt künftig aus den Tokens statt aus
   eigener Media Query.
6. **Expertus** — zuerst der Go-Server, dann die Tokens.

## Absicherung

Die vorhandenen Tests der Projekte sind das Sicherheitsnetz der Migration:
Hostus' Mutationstest auf seine Assets, Expertus' axe-core-Lauf über
Playwright, Ortus' `frontend_test.go`. Sie bleiben unverändert bestehen und
müssen nach jedem Migrationsschritt grün sein.

Ergänzt wird je Dienst ein Test, der prüft, dass die ausgelieferte Seite das
Design-System-CSS tatsächlich einbindet — sonst fällt ein Dienst
unbemerkt auf lokale Reste zurück.

## Bewusst nicht enthalten

- Kein Umschalter für das Thema und keine gespeicherte Wahl; allein die
  Systemeinstellung entscheidet.
- Keine dienstspezifischen Akzentfarben.
- Keine JavaScript-Komponenten. Das Design-System liefert CSS; Verhalten
  (Tabs, Accordion) bleibt Sache der Dienste.
- Kein Bundler, kein npm, kein Git-Submodul.
