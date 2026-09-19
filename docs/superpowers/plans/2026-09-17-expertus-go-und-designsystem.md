# Expertus: Go-Server und Design-System — Implementierungsplan

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kontrollkästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Expertus von nginx auf einen eigenen Go-Server umstellen, auf das Design-System heben und die Mängel beheben, die das Design-System nicht abdeckt.

**Architektur:** Ein Go-Server bettet das bestehende Frontend per `go:embed` ein und übernimmt, was heute `nginx.conf` und `entrypoint.sh` leisten: Konfiguration aus der Umgebung, Sicherheits-Header, CSP, Fallback auf `index.html`. Das Frontend selbst bleibt, was es ist — ES-Module ohne Bundler, DOM-Aufbau über `el()`. Die Gestaltung kommt aus dem Design-System; Expertus ergänzt nur sein Layout-Gerüst.

**Tech-Stack:** Go 1.26 mit `embed` und `net/http` ohne Fremdpakete, ES-Module ohne Bundler, Playwright und axe-core für die Prüfung.

**Spec:** `../fieldworksdiary-designsystem/docs/design.md` (Abschnitte „Expertus: Umstellung auf Go" und „Farb-Tokens")

## Globale Randbedingungen

- Go-Version in `go.mod`: `go 1.26.0`, Modulpfad `github.com/jobrunner/expertus`
- Abhängigkeit: `github.com/jobrunner/fieldworksdiary-designsystem` — die einzige. **Noch keine Marke veröffentlicht**, also per Pseudo-Fassung vom Hauptzweig beziehen (`go get github.com/jobrunner/fieldworksdiary-designsystem@main`).

**Das Modul ist seit Erstellung dieses Plans erheblich gewachsen. Was es jetzt bietet:**

| Bestandteil | Aufruf |
|---|---|
| Stylesheet | `designsystem.CSS()` |
| Skript (Combobox) | `designsystem.JS()` |
| Kopf-/Fußzeile | `designsystem.Kopfzeile(KopfDaten{…})`, `Fusszeile(FussDaten{…})` — liefern `template.HTML`, maskieren ihre Eingaben |
| 41 Symbole | `icons.Standort()`, `icons.ChevronUnten()`, … ; `icons.Alle()`, `icons.Gruppen()` |
| Symbol mit Klasse | `icons.MitKlasse(icons.Standort(), "icon")` |
| Symbol in Vorlagen | `icons.Standort().HTML()` — **wichtig**, sonst maskiert `html/template` das SVG zu sichtbarem Quelltext |

**Die Palette ist grün, nicht blau.** `--accent` (`#186029`) ist eine **Fläche** und trägt weiße Schrift über `--accent-on`; als **Textfarbe** dient `--accent-text`. Für Links, Reiter und Umrisse niemals `var(--accent)` verwenden — im dunklen Thema wären das 1,91:1. Es gibt kein `--success` mehr (Erfolg ist die Markenfarbe), dafür `--info`.

**Komponenten, die Expertus nutzen soll, statt sie selbst zu bauen:** `.card`, `.btn`/`.btn-secondary`/`.btn-icon`, `.form-group`, `.table-wrap`, `.badge*`, `.error`/`.warning`/`.info`, `.akkordeon` (natives `<details>`), `.combobox` samt Skript, `.icon`, `.sr-only`, `.skip-link`.
- Expertus läuft hinter Caddy unter `https://expertus.fieldworksdiary.org`. Der Server spricht **nur HTTP** auf `NGINX_PORT` (Vorgabewert 8080, Name bleibt zunächst, siehe Aufgabe 4) und terminiert kein TLS.
- Die vorhandenen Tests sind das Sicherheitsnetz: `make test`, `make a11y`, `make e2e` müssen nach **jeder** Aufgabe grün sein.
- Kein Bundler, kein npm zur Laufzeit. `package.json` bleibt reines Entwicklungswerkzeug.
- Alles, was Text ist, geht weiter über `textContent`, nie über `innerHTML` — siehe den Kommentar in `src/dom.js`.
- Kommentare auf Deutsch, im bestehenden Stil: sie begründen, warum etwas so ist.
- Lokal getestet wird über `http://127.0.0.1:5173` — `playwright.config.js` und das `smoke`-Ziel binden darauf, und `localhost` wäre CORS-seitig ein anderer Ursprung.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `go.mod`, `go.sum` | Modul und die eine Abhängigkeit |
| `embed.go` | bettet die Frontend-Dateien ein — muss im Wurzelverzeichnis liegen |
| `cmd/expertus/main.go` | Einstieg: Umgebung lesen, Server starten — sonst nichts |
| `internal/server/server.go` | Router und Einbettung der Frontend-Dateien |
| `internal/server/config.go` | Umgebung → Dienstadressen, `/config.json` |
| `internal/server/headers.go` | CSP und die übrigen Sicherheits-Header |
| `internal/server/*_test.go` | je eine Testdatei zur Einheit daneben |
| `src/layout.js` | **neu:** das Seitengerüst, das Kopf und Inhalt zusammenbringt |
| `index.html` | Gerüst, Verweis auf das Design-System-CSS |
| `styles.css` | schrumpft auf das, was Expertus über das System hinaus braucht |
| `Dockerfile` | mehrstufiger Go-Build |
| `docker/` | entfällt |

`internal/server` wird auf drei Dateien verteilt, weil die drei Belange
unabhängig voneinander getestet werden können: Routen, Konfiguration und
Header. Eine Datei mit allen dreien wäre schon bei ihrer Entstehung zu groß,
um sie beim Ändern ganz zu überblicken.

`embed.go` liegt im Wurzelverzeichnis, weil es nicht anders geht: die Muster
von `go:embed` dürfen kein `..` enthalten, ein Paket kann also nur Dateien
unterhalb seines eigenen Verzeichnisses einbetten. `internal/server` bekommt
das Dateisystem deshalb übergeben, statt es selbst zu holen — was die Tests
nebenbei unabhängig von der Einbettung macht.

---

### Aufgabe 1: Statisches Ausliefern

**Dateien:**
- Anlegen: `go.mod`, `internal/server/server.go`, `internal/server/server_test.go`, `cmd/expertus/main.go`
- Test: `internal/server/server_test.go`

**Schnittstellen:**
- Liefert: `func New(cfg Config, frontend fs.FS) http.Handler` und `type Config struct { OrtusBaseURL, HabitatusBaseURL, HostusBaseURL, SitusBaseURL string }` sowie `expertus.Frontend embed.FS` im Wurzelpaket — Aufgabe 2, 3 und 5 bauen darauf auf.

- [ ] **Schritt 1: Modul anlegen**

```bash
cd /Users/jbrunner/work/projects/expertus
cat > go.mod <<'EOF'
module github.com/jobrunner/expertus

go 1.26.0
EOF
```

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`internal/server/server_test.go`:

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	expertus "github.com/jobrunner/expertus"
)

func TestLiefertFrontendDateien(t *testing.T) {
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	for _, f := range []struct {
		pfad string
		typ  string
		teil string
	}{
		{"/", "text/html; charset=utf-8", "<title>Expertus"},
		{"/index.html", "text/html; charset=utf-8", "<title>Expertus"},
		{"/styles.css", "text/css; charset=utf-8", ":root"},
		{"/src/app.js", "text/javascript; charset=utf-8", "loadConfig"},
	} {
		t.Run(f.pfad, func(t *testing.T) {
			res, err := http.Get(srv.URL + f.pfad)
			if err != nil {
				t.Fatalf("GET %s: %v", f.pfad, err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusOK {
				t.Fatalf("Status %d, erwartet 200", res.StatusCode)
			}
			if got := res.Header.Get("Content-Type"); got != f.typ {
				t.Errorf("Content-Type %q, erwartet %q", got, f.typ)
			}
			buf := new(strings.Builder)
			if _, err := buf.ReadFrom(res.Body); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(buf.String(), f.teil) {
				t.Errorf("%q kommt in der Antwort nicht vor", f.teil)
			}
		})
	}
}

func TestUnbekannteRouteLiefertIndex(t *testing.T) {
	// Die Anwendung führt ihre Routen im Fragment (#/plots), nicht im Pfad.
	// Ein Aufruf tiefer Pfade entsteht trotzdem — etwa durch ein Lesezeichen
	// aus einer früheren Fassung. nginx löste das mit try_files.
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/gibtesnicht")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("Status %d, erwartet 200 mit index.html", res.StatusCode)
	}
	buf := new(strings.Builder)
	buf.ReadFrom(res.Body)
	if !strings.Contains(buf.String(), "<title>Expertus") {
		t.Error("die Antwort ist nicht index.html")
	}
}

func TestVerzeichnisWirdNichtAufgelistet(t *testing.T) {
	// http.FileServer listet Verzeichnisse von sich aus auf. Das gäbe die
	// Dateistruktur preis und ist kein Teil der Anwendung.
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/src/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	buf := new(strings.Builder)
	buf.ReadFrom(res.Body)
	if strings.Contains(buf.String(), "app.js</a>") {
		t.Error("das Verzeichnis /src/ wurde aufgelistet")
	}
}
```

- [ ] **Schritt 3: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `go test ./internal/server/ -v`
Erwartet: Übersetzungsfehler — `undefined: New`, `undefined: Config`.

- [ ] **Schritt 4: Die Umsetzung schreiben**

Zuerst `embed.go` im **Wurzelverzeichnis** — die Muster von `go:embed` dürfen
kein `..` enthalten, ein Paket unter `internal/` könnte diese Dateien also
gar nicht erreichen:

```go
// Package expertus bettet das Frontend ein. Es steht im Wurzelverzeichnis,
// weil go:embed nur Dateien unterhalb des eigenen Paketverzeichnisses
// aufnehmen kann — aus internal/server heraus wären index.html und src/
// unerreichbar.
package expertus

import "embed"

// Frontend enthält die Dateien unverändert. Damit bleibt gültig, was zuvor
// im Dockerfile stand: das Ausgelieferte ist identisch mit dem, was im
// Repository steht — es findet keine Umwandlung statt, nur ein Kopieren ins
// Binärprogramm.
//
//go:embed index.html styles.css src
var Frontend embed.FS
```

`internal/server/server.go`:

```go
// Package server liefert das Expertus-Frontend aus und übernimmt, was
// zuvor nginx tat: Konfiguration aus der Umgebung, Sicherheits-Header und
// den Rückfall auf index.html.
//
// Der Server terminiert kein TLS. Expertus läuft hinter Caddy, das die
// Verschlüsselung übernimmt; ein zweites Zertifikat hier wäre unbenutzt.
package server

import (
	"io/fs"
	"net/http"
	"strings"
)

// Config trägt die Adressen der Dienste, die das Frontend anspricht. Sie
// stehen an genau zwei Stellen: in /config.json, das die Anwendung liest,
// und in der CSP, die den Zugriff überhaupt erst erlaubt. Ein Dienst, der
// nur an einer der beiden Stellen steht, fällt im Betrieb aus.
type Config struct {
	OrtusBaseURL     string
	HabitatusBaseURL string
	HostusBaseURL    string
	// SitusBaseURL ist vorgesehen, aber noch nicht in Gebrauch: über Situs
	// sollen später Zusatzinformationen zu einem erkannten Habitat
	// abrufbar sein. Leer bleibt die Adresse aus CSP und /config.json
	// heraus.
	SitusBaseURL string
}

// New baut den Router. Das Dateisystem wird übergeben, nicht hier geholt:
// go:embed kann nur unterhalb des eigenen Pakets einbetten, und ein
// übergebenes fs.FS macht die Tests unabhängig von der Einbettung.
func New(cfg Config, frontend fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", sicherheitsHeader(cfg, frontendHandler(frontend)))
	return mux
}

// frontendHandler liefert die eingebetteten Dateien und fällt auf
// index.html zurück, wenn ein Pfad nicht existiert — der Ersatz für
// try_files aus der nginx-Konfiguration.
func frontendHandler(frontend fs.FS) http.Handler {
	server := http.FileServer(http.FS(frontend))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pfad := strings.TrimPrefix(r.URL.Path, "/")
		if pfad == "" {
			pfad = "index.html"
		}
		// Verzeichnisse werden nicht ausgeliefert: http.FileServer würde
		// sie auflisten und damit die Dateistruktur preisgeben.
		if info, err := fs.Stat(frontend, pfad); err != nil || info.IsDir() {
			index(w, frontend)
			return
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/" + pfad
		server.ServeHTTP(w, r2)
	})
}

func index(w http.ResponseWriter, frontend fs.FS) {
	daten, err := fs.ReadFile(frontend, "index.html")
	if err != nil {
		http.Error(w, "index.html fehlt", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Ohne Build gibt es keine Prüfsummen in Dateinamen — "immutable" wäre
	// falsch, eine neue Fassung würde nie ankommen.
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(daten)
}
```

Vorerst reicht `sicherheitsHeader` als Durchreiche; Aufgabe 3 füllt sie. `internal/server/headers.go`:

```go
package server

import "net/http"

// sicherheitsHeader wird in Aufgabe 3 gefüllt.
func sicherheitsHeader(cfg Config, next http.Handler) http.Handler {
	return next
}
```

`cmd/expertus/main.go`:

```go
// Startet den Expertus-Server. Die Adressen der Dienste kommen aus der
// Umgebung, damit dieselbe Abbildung in jeder Umgebung läuft.
package main

import (
	"log"
	"net/http"
	"os"

	expertus "github.com/jobrunner/expertus"
	"github.com/jobrunner/expertus/internal/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	cfg := server.Config{
		OrtusBaseURL:     os.Getenv("ORTUS_BASE_URL"),
		HabitatusBaseURL: os.Getenv("HABITATUS_BASE_URL"),
		HostusBaseURL:    os.Getenv("HOSTUS_BASE_URL"),
		SitusBaseURL:     os.Getenv("SITUS_BASE_URL"),
	}
	log.Printf("Expertus auf :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, server.New(cfg, expertus.Frontend)))
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

Ausführen: `go test ./internal/server/ -v`
Erwartet: PASS für alle drei Tests.

- [ ] **Schritt 6: Die bestehenden Tests prüfen**

Ausführen: `make test`
Erwartet: unverändert grün — an JavaScript wurde nichts geändert.

- [ ] **Schritt 7: Einchecken**

```bash
git add go.mod embed.go cmd/ internal/
git commit -m "feat: Frontend über einen Go-Server ausliefern

Erster Schritt der Ablösung von nginx. Die Dateien werden per go:embed
unverändert ins Binärprogramm gelegt; damit bleibt gültig, dass das
Ausgelieferte dem Repository-Inhalt entspricht."
```

---

### Aufgabe 2: Konfiguration aus der Umgebung

**Dateien:**
- Anlegen: `internal/server/config.go`, `internal/server/config_test.go`
- Ändern: `internal/server/server.go` (eine Route ergänzen)
- Löschen: `config.json`

**Schnittstellen:**
- Nutzt: `Config` aus Aufgabe 1.
- Liefert: die Route `/config.json` mit den Feldern `ortusBaseUrl`, `habitatusBaseUrl`, `hostusBaseUrl` — `src/config.js` liest sie unverändert weiter.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`internal/server/config_test.go`:

```go
package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	expertus "github.com/jobrunner/expertus"
)

func TestConfigJSONSpiegeltDieUmgebung(t *testing.T) {
	cfg := Config{
		OrtusBaseURL:     "https://ortus.example.org",
		HabitatusBaseURL: "https://habitatus.example.org",
		HostusBaseURL:    "https://hostus.example.org",
	}
	srv := httptest.NewServer(New(cfg, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if got := res.Header.Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Errorf("Content-Type %q", got)
	}
	// Eine zwischengespeicherte Konfiguration zeigte nach einem Umzug
	// eines Dienstes weiter auf die alte Adresse.
	if got := res.Header.Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control %q, erwartet no-cache", got)
	}

	var gelesen map[string]string
	if err := json.NewDecoder(res.Body).Decode(&gelesen); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	for schluessel, erwartet := range map[string]string{
		"ortusBaseUrl":     cfg.OrtusBaseURL,
		"habitatusBaseUrl": cfg.HabitatusBaseURL,
		"hostusBaseUrl":    cfg.HostusBaseURL,
	} {
		if gelesen[schluessel] != erwartet {
			t.Errorf("%s = %q, erwartet %q", schluessel, gelesen[schluessel], erwartet)
		}
	}
}

func TestConfigJSONLaesstSitusWegSolangeUnkonfiguriert(t *testing.T) {
	// Ein leerer Schlüssel im JSON sähe für die Anwendung aus wie eine
	// gesetzte, aber unbrauchbare Adresse.
	srv := httptest.NewServer(New(Config{OrtusBaseURL: "https://ortus.example.org"}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var gelesen map[string]string
	json.NewDecoder(res.Body).Decode(&gelesen)
	if _, da := gelesen["situsBaseUrl"]; da {
		t.Error("situsBaseUrl steht im JSON, obwohl keine Adresse gesetzt ist")
	}
}

func TestConfigJSONNenntSitusSobaldGesetzt(t *testing.T) {
	srv := httptest.NewServer(New(Config{SitusBaseURL: "https://situs.example.org"}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var gelesen map[string]string
	json.NewDecoder(res.Body).Decode(&gelesen)
	if gelesen["situsBaseUrl"] != "https://situs.example.org" {
		t.Errorf("situsBaseUrl = %q", gelesen["situsBaseUrl"])
	}
}
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `go test ./internal/server/ -run TestConfig -v`
Erwartet: FAIL — `/config.json` liefert derzeit `index.html`, das Entschlüsseln des JSON schlägt fehl.

- [ ] **Schritt 3: Die Umsetzung schreiben**

`internal/server/config.go`:

```go
package server

import (
	"encoding/json"
	"net/http"
)

// configHandler gibt der Anwendung die Adressen der Dienste. Zuvor schrieb
// entrypoint.sh dieselbe Datei beim Start des Containers; hier entsteht sie
// bei jedem Abruf neu, womit ein Neustart zum Ändern einer Adresse genügt.
func configHandler(cfg Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Nur gesetzte Adressen werden genannt. Ein leerer Wert sähe für
		// die Anwendung aus wie eine gesetzte, aber unbrauchbare Adresse —
		// sie würde gegen "" laufen statt den Dienst zu überspringen.
		aus := map[string]string{}
		for schluessel, wert := range map[string]string{
			"ortusBaseUrl":     cfg.OrtusBaseURL,
			"habitatusBaseUrl": cfg.HabitatusBaseURL,
			"hostusBaseUrl":    cfg.HostusBaseURL,
			"situsBaseUrl":     cfg.SitusBaseURL,
		} {
			if wert != "" {
				aus[schluessel] = wert
			}
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		// Eine zwischengespeicherte Konfiguration zeigte nach dem Umzug
		// eines Dienstes weiter auf dessen alte Adresse.
		w.Header().Set("Cache-Control", "no-cache")
		json.NewEncoder(w).Encode(aus)
	})
}
```

In `server.go` die Route vor dem Auffangmuster eintragen:

```go
func New(cfg Config, frontend fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/config.json", sicherheitsHeader(cfg, configHandler(cfg)))
	mux.Handle("/", sicherheitsHeader(cfg, frontendHandler(frontend)))
	return mux
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `go test ./internal/server/ -v`
Erwartet: PASS.

- [ ] **Schritt 5: Die alte Datei entfernen**

```bash
git rm config.json
```

Sie wurde im Betrieb ohnehin von `entrypoint.sh` überschrieben und diente nur der lokalen Entwicklung — diese Rolle übernimmt jetzt der Server.

- [ ] **Schritt 6: Alles prüfen**

Ausführen: `go test ./... && make test`
Erwartet: beides grün.

- [ ] **Schritt 7: Einchecken**

```bash
git add internal/server/config.go internal/server/config_test.go internal/server/server.go
git commit -m "feat: config.json aus der Umgebung ausliefern

Ersetzt entrypoint.sh. Nur gesetzte Adressen werden genannt: ein leerer
Wert sähe für die Anwendung aus wie eine gesetzte, aber unbrauchbare
Adresse."
```

---

### Aufgabe 3: Sicherheits-Header und CSP

**Dateien:**
- Ändern: `internal/server/headers.go`
- Test: `internal/server/headers_test.go`

**Schnittstellen:**
- Nutzt: `Config` aus Aufgabe 1.
- Liefert: die Header `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` auf jeder Antwort.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`internal/server/headers_test.go`:

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	expertus "github.com/jobrunner/expertus"
)

func TestSicherheitsHeaderAufJederAntwort(t *testing.T) {
	srv := httptest.NewServer(New(Config{OrtusBaseURL: "https://ortus.example.org"}, expertus.Frontend))
	defer srv.Close()

	for _, pfad := range []string{"/", "/index.html", "/styles.css", "/src/app.js", "/config.json", "/gibtesnicht"} {
		t.Run(pfad, func(t *testing.T) {
			res, err := http.Get(srv.URL + pfad)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			for header, erwartet := range map[string]string{
				"X-Content-Type-Options": "nosniff",
				"Referrer-Policy":        "no-referrer",
			} {
				if got := res.Header.Get(header); got != erwartet {
					t.Errorf("%s = %q, erwartet %q", header, got, erwartet)
				}
			}
			if res.Header.Get("Content-Security-Policy") == "" {
				t.Error("Content-Security-Policy fehlt")
			}
		})
	}
}

func TestCSPNenntDieKonfiguriertenDienste(t *testing.T) {
	// Stünde hier eine feste Liste, blockierte die Richtlinie genau die
	// Dienste, die man gerade konfiguriert hat.
	cfg := Config{
		OrtusBaseURL:     "https://ortus.example.org",
		HabitatusBaseURL: "https://habitatus.example.org",
		HostusBaseURL:    "https://hostus.example.org",
	}
	srv := httptest.NewServer(New(cfg, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	csp := res.Header.Get("Content-Security-Policy")

	for _, adresse := range []string{cfg.OrtusBaseURL, cfg.HabitatusBaseURL, cfg.HostusBaseURL} {
		if !strings.Contains(csp, adresse) {
			t.Errorf("connect-src nennt %s nicht: %s", adresse, csp)
		}
	}
	for _, pflicht := range []string{
		"default-src 'self'",
		"img-src 'self' data:",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	} {
		if !strings.Contains(csp, pflicht) {
			t.Errorf("CSP enthält %q nicht: %s", pflicht, csp)
		}
	}
}

func TestCSPFuehrtKeineLeerenAdressenAuf(t *testing.T) {
	// Eine leere Adresse erzeugte in der Liste zwei Leerzeichen
	// hintereinander; manche Browser verwerfen daraufhin die ganze
	// Richtlinie — aus der strengsten Einstellung würde gar keine.
	srv := httptest.NewServer(New(Config{OrtusBaseURL: "https://ortus.example.org"}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	csp := res.Header.Get("Content-Security-Policy")
	if strings.Contains(csp, "  ") {
		t.Errorf("CSP enthält doppelte Leerzeichen: %q", csp)
	}
	if strings.Contains(csp, "; ;") || strings.HasSuffix(strings.TrimSpace(csp), ";") {
		t.Errorf("CSP enthält eine leere Regel: %q", csp)
	}
}
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `go test ./internal/server/ -run TestCSP -v`
Erwartet: FAIL — die Header fehlen vollständig.

- [ ] **Schritt 3: Die Umsetzung schreiben**

`internal/server/headers.go` vollständig:

```go
package server

import (
	"net/http"
	"strings"
)

// sicherheitsHeader setzt auf jeder Antwort dieselben Kopfzeilen. In der
// nginx-Konfiguration mussten sie in jedem location-Block wiederholt
// werden, weil nginx add_header nicht an einen Block vererbt, der selbst
// welche setzt; hier genügt eine Stelle.
//
// TLS-bezogene Kopfzeilen (HSTS) stehen bewusst nicht hier: Expertus läuft
// hinter Caddy, das die Verschlüsselung terminiert und diese Zusage
// deshalb selbst geben muss.
func sicherheitsHeader(cfg Config, next http.Handler) http.Handler {
	csp := buildCSP(cfg)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// buildCSP baut die Richtlinie aus denselben Adressen, die auch in
// /config.json stehen. Eine fest eingetragene Liste blockierte genau die
// Dienste, die gerade konfiguriert wurden.
func buildCSP(cfg Config) string {
	// Leere Adressen werden übersprungen: sie erzeugten sonst zwei
	// Leerzeichen hintereinander, woraufhin manche Browser die ganze
	// Richtlinie verwerfen — aus der strengsten Einstellung würde gar
	// keine.
	quellen := []string{"'self'"}
	for _, adresse := range []string{cfg.OrtusBaseURL, cfg.HabitatusBaseURL, cfg.HostusBaseURL, cfg.SitusBaseURL} {
		if adresse != "" {
			quellen = append(quellen, adresse)
		}
	}
	return strings.Join([]string{
		"default-src 'self'",
		"connect-src " + strings.Join(quellen, " "),
		"img-src 'self' data:",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	}, "; ")
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `go test ./internal/server/ -v`
Erwartet: PASS.

- [ ] **Schritt 5: Von Hand gegensehen**

```bash
ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
PORT=5173 go run ./cmd/expertus &
sleep 1
curl -sI http://127.0.0.1:5173/ | grep -i "content-security\|x-content\|referrer"
curl -s http://127.0.0.1:5173/config.json
kill %1
```

Erwartet: die drei Kopfzeilen, und ein JSON mit den drei Adressen.

- [ ] **Schritt 6: Einchecken**

```bash
git add internal/server/headers.go internal/server/headers_test.go
git commit -m "feat: Sicherheits-Header und CSP im Server

Ersetzt die Kopfzeilen aus nginx.conf. Die CSP entsteht aus denselben
Adressen wie config.json; leere werden übersprungen, weil manche
Browser bei einer fehlerhaften Liste die ganze Richtlinie verwerfen."
```

---

### Aufgabe 4: nginx ablösen

**Dateien:**
- Ändern: `Dockerfile`, `Makefile`, `playwright.config.js`, `.gitignore`, `.github/workflows/ci.yml`
- Löschen: `docker/nginx.conf`, `docker/entrypoint.sh`
- Test: `e2e/container.sh` (bestehend, muss weiter laufen)

**Schnittstellen:**
- Nutzt: `cmd/expertus` aus Aufgabe 1 bis 3.
- Liefert: ein Abbild, das auf `PORT` lauscht; `make serve` startet dasselbe Binärprogramm wie der Container.

- [ ] **Schritt 1: Den Dockerfile ersetzen**

```dockerfile
# Zweistufig: bauen, dann nur das Binärprogramm ausliefern. Eine
# Umwandlung der Frontend-Dateien findet weiterhin nicht statt — go:embed
# legt sie unverändert ins Binärprogramm, das Ausgelieferte entspricht
# also nach wie vor dem Repository-Inhalt.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /expertus ./cmd/expertus

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /expertus /expertus

ENV ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
    HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
    HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
    PORT=8080

USER nonroot
EXPOSE 8080
ENTRYPOINT ["/expertus"]
```

Die Rechtevergabe für nginx-Verzeichnisse entfällt vollständig: das
Binärprogramm schreibt nirgendwohin und läuft von Anfang an als
unprivilegierter Nutzer.

- [ ] **Schritt 2: Die alten Dateien entfernen**

```bash
git rm docker/nginx.conf docker/entrypoint.sh
rmdir docker 2>/dev/null || true
```

- [ ] **Schritt 3: Das Makefile anpassen**

Die drei Ziele, die `python3 -m http.server` starten, rufen jetzt das
Binärprogramm — damit prüft die lokale Sitzung dasselbe wie der Container,
einschließlich CSP und Kopfzeilen.

```make
.PHONY: test check serve docker docker-test a11y smoke e2e go-test

DEV_ENV = ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
          HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
          HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
          PORT=5173

test:
	node --test $$(find test -name '*.test.js' | sort)

go-test:
	go test ./... -v

check: test go-test a11y

serve:
	$(DEV_ENV) go run ./cmd/expertus

smoke:
	node scripts/smoke.mjs

a11y:
	.claude/skills/web-accessibility-audit/scripts/a11y-grep.sh --all . --strict
	npx playwright test e2e/a11y.spec.js
	@sh -c '\
		$(DEV_ENV) go run ./cmd/expertus >/dev/null 2>&1 & \
		srv=$$!; \
		trap "kill $$srv 2>/dev/null" EXIT; \
		for i in $$(seq 1 30); do curl -sf http://127.0.0.1:5173/index.html >/dev/null 2>&1 && break; sleep 0.2; done; \
		node scripts/axe-audit-routes.mjs \
	'

e2e:
	npx playwright test

docker:
	docker build -t expertus:dev .
	docker run --rm -p 8080:8080 expertus:dev

docker-test:
	sh e2e/container.sh
```

- [ ] **Schritt 4: Playwright anpassen**

`playwright.config.js`:

```js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173' },
  // Derselbe Server wie im Container — die Sicherheits-Header und die CSP
  // gelten damit auch im Test. Unter python3 -m http.server fehlten sie,
  // und eine zu enge CSP wäre erst im Betrieb aufgefallen.
  webServer: {
    command: 'go run ./cmd/expertus',
    url: 'http://127.0.0.1:5173/index.html',
    reuseExistingServer: true,
    env: {
      ORTUS_BASE_URL: 'https://ortus.fieldworksdiary.org',
      HABITATUS_BASE_URL: 'https://habitatus.fieldworksdiary.org',
      HOSTUS_BASE_URL: 'https://hostus.fieldworksdiary.org',
      PORT: '5173',
    },
  },
})
```

- [ ] **Schritt 5: `.gitignore` ergänzen**

```bash
cat >> .gitignore <<'EOF'
.playwright-mcp/
/expertus
EOF
```

- [ ] **Schritt 6: Die Fortlaufende Integration um Go erweitern**

In `.github/workflows/ci.yml` vor den bestehenden Schritten ergänzen:

```yaml
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - name: Go-Tests
        run: go test ./... -v
      - name: Go-Formatierung
        run: test -z "$(gofmt -l .)"
```

- [ ] **Schritt 7: Alles prüfen**

```bash
go test ./...
make test
make e2e
make a11y
make docker-test
```

Erwartet: alles grün. Schlägt `make a11y` beim axe-Lauf fehl, liegt es
vermutlich an der nun auch lokal wirksamen CSP — die Meldung in der
Browser-Konsole nennt die blockierte Quelle.

- [ ] **Schritt 8: Einchecken**

```bash
git add -A
git commit -m "feat: nginx durch den Go-Server ersetzen

Container, Makefile und Playwright starten jetzt dasselbe Binärprogramm.
Damit gelten CSP und Sicherheits-Header auch im Test; unter
python3 -m http.server fehlten sie und eine zu enge Richtlinie wäre erst
im Betrieb aufgefallen."
```

---

### Aufgabe 5: Design-System einbinden

**Dateien:**
- Ändern: `go.mod`, `internal/server/server.go`, `index.html`, `styles.css`
- Test: `internal/server/designsystem_test.go`

**Schnittstellen:**
- Nutzt: `designsystem.CSS()` aus dem ersten Plan.
- Liefert: die Route `/assets/designsystem.css`.

- [ ] **Schritt 1: Die Abhängigkeit aufnehmen**

```bash
go get github.com/jobrunner/fieldworksdiary-designsystem@v0.1.0
```

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`internal/server/designsystem_test.go`:

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	expertus "github.com/jobrunner/expertus"
)

func TestDesignSystemCSSWirdAusgeliefert(t *testing.T) {
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/assets/designsystem.css")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("Status %d, erwartet 200", res.StatusCode)
	}
	if got := res.Header.Get("Content-Type"); got != "text/css; charset=utf-8" {
		t.Errorf("Content-Type %q", got)
	}
	buf := new(strings.Builder)
	buf.ReadFrom(res.Body)
	for _, teil := range []string{"--control-line:", ".card {"} {
		if !strings.Contains(buf.String(), teil) {
			t.Errorf("%q fehlt in der Antwort — es werden nicht beide Dateien ausgeliefert", teil)
		}
	}
}

func TestIndexBindetDesignSystemEin(t *testing.T) {
	// Ohne diese Prüfung fiele die Seite unbemerkt auf ihre lokalen Reste
	// zurück, sobald der Verweis beim Umbauen verloren geht.
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	buf := new(strings.Builder)
	buf.ReadFrom(res.Body)
	if !strings.Contains(buf.String(), "/assets/designsystem.css") {
		t.Error("index.html verweist nicht auf das Design-System")
	}
}
```

- [ ] **Schritt 3: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `go test ./internal/server/ -run TestDesignSystem -v`
Erwartet: FAIL — Status 200 mit `index.html` statt CSS.

- [ ] **Schritt 4: Die Route ergänzen**

In `server.go`:

```go
import (
	"io/fs"
	"net/http"
	"strings"

	designsystem "github.com/jobrunner/fieldworksdiary-designsystem"
)

func New(cfg Config, frontend fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/assets/designsystem.css", sicherheitsHeader(cfg, designSystemHandler()))
	mux.Handle("/config.json", sicherheitsHeader(cfg, configHandler(cfg)))
	mux.Handle("/", sicherheitsHeader(cfg, frontendHandler(frontend)))
	return mux
}

// designSystemHandler liefert die gemeinsame Gestaltungsgrundlage. Sie
// kommt aus dem Modul, nicht aus diesem Repository: so bekommt Expertus
// Änderungen über einen Versionssprung statt über eine Kopie, die
// auseinanderläuft.
func designSystemHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(designsystem.CSS())
	})
}
```

- [ ] **Schritt 5: `index.html` anpassen**

Im `<head>`, **vor** `styles.css` — die eigene Datei muss überschreiben können:

```html
    <link rel="stylesheet" href="/assets/designsystem.css" />
    <link rel="stylesheet" href="/styles.css" />
```

- [ ] **Schritt 6: `styles.css` auf den Rest eindampfen**

Alles, was das Design-System schon leistet, fliegt raus: `:root`-Variablen,
Reset, `:focus-visible`, Mindesthöhen, `max-width` auf Feldern, `.skip-link`,
`.visually-hidden`. Was bleibt, ist Expertus-eigenes:

```css
/* Was Expertus über das Design-System hinaus braucht.
   Alles Allgemeine — Variablen, Reset, Fokus, Formularelemente, Karten —
   kommt aus /assets/designsystem.css. */

/* Der bisherige Name bleibt in Gebrauch; das Design-System nennt die
   Klasse .sr-only. Beide zeigen auf dasselbe, bis die Aufrufe umgestellt
   sind. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}

/* Warnender Nebentext — etwa eine verweigerte Standortfreigabe. */
.warn {
  color: var(--warning);
}
```

- [ ] **Schritt 7: Alles prüfen**

```bash
go test ./...
make test
make a11y
make e2e
```

Erwartet: grün. Der axe-Lauf prüft unter anderem die Kontraste — das
Design-System ist auf 7:1 ausgelegt und sollte ihn eher entlasten.

- [ ] **Schritt 8: Symbole und Skript mit ausliefern**

Ergänze zwei weitere Routen analog zum Stylesheet:

```go
mux.Handle("/assets/designsystem.js", sicherheitsHeader(cfg, designSystemJSHandler()))
```

Das Skript wird für die Combobox gebraucht (Artensuche). Content-Type
`text/javascript; charset=utf-8`.

Die Symbole kommen dagegen **nicht** über eine Route, sondern werden im
Markup eingesetzt. Da Expertus sein DOM in JavaScript baut (`src/dom.js`,
`el()`), brauchst du die SVG-Zeichenketten im Frontend. Entscheide begründet,
wie du sie dorthin bringst — etwa als eigene Route, die die benötigten
Symbole als JSON oder als ES-Modul liefert, oder indem der Server sie beim
Ausliefern in die Seite einsetzt. **Hole nicht alle 41**, sondern nur die,
die Expertus braucht: `standort` (Knopf „Aktuellen Standort verwenden"),
`chevron-unten` (Akkordeon), dazu was sich beim Umbau als nützlich zeigt.

- [ ] **Schritt 9: Mit eigenen Augen ansehen**

```bash
make serve
```

`http://127.0.0.1:5173` öffnen, Liste und Maske ansehen. Erwartete
Veränderung: Beschriftungen stehen über ihren Feldern statt daneben, die
Auswahlfelder sind gleich breit, Knöpfe tragen die grüne Akzentfarbe.
Noch **nicht** behoben: Kopf und Inhalt stehen weiter unverbunden — das ist
Aufgabe 6.

- [ ] **Schritt 9: Einchecken**

```bash
git add go.mod go.sum internal/server/ index.html styles.css
git commit -m "feat: Design-System einbinden

styles.css schrumpft auf das, was Expertus über das gemeinsame System
hinaus braucht. Ein Test prüft, dass index.html den Verweis trägt: sonst
fiele die Seite beim Umbauen unbemerkt auf lokale Reste zurück."
```

---

### Aufgabe 6: Seitengerüst — **aus dem Modul, nicht selbst gebaut**

> **Achtung, gegenüber der ursprünglichen Fassung geändert.** Dieser Plan sah vor,
> dass Expertus sein Gerüst selbst baut. Inzwischen liefert das Modul es:
> `designsystem.Kopfzeile()` und `Fusszeile()` samt der Regeln `.ds-kopf`,
> `.ds-fuss` in `base.css`. **Baue es nicht nach.** Da Expertus sein HTML nicht
> in Go erzeugt, sondern eine statische `index.html` ausliefert, gibt es zwei
> Wege — entscheide begründet:
>
> 1. Der Go-Server setzt Kopf und Fuß beim Ausliefern in die Seite ein
>    (Platzhalter ersetzen, wie es `demo/demo.go` im Modul vormacht). Vorteil:
>    eine Quelle, Fassungsnummer und Verweise kommen aus der Konfiguration.
> 2. `index.html` schreibt das Markup mit den Klassen `.ds-kopf` / `.ds-fuss`
>    von Hand. Einfacher, aber das Markup kann von dem des Moduls abweichen,
>    ohne dass es auffällt.
>
> Der erste Weg ist vorzuziehen; er ist im Modul erprobt.

**Dateien:**
- Ändern: `index.html`, `styles.css`, `internal/server/server.go`

**Schnittstellen:**
- Liefert: nichts nach außen — `index.html` bekommt die Gerüststruktur, `layout.js` hält die Kennungen, die `app.js` bereits nutzt (`#ansicht`, `#meldungen`).

Behebt Punkt 1 des Befunds: der `header` beginnt heute bei x = 0, `main` ist
auf 48 rem zentriert und beginnt bei x = 272 — Kopf und Inhalt stehen in
keiner Beziehung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`test/layout.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('Kopf, Inhalt und Fuß liegen in derselben Spur', () => {
  // Ohne gemeinsamen Container beginnt der Kopf am Fensterrand und der
  // Inhalt 272 px weiter innen — die Seite wirkt zerrissen.
  for (const abschnitt of ['<header', '<main', '<footer']) {
    const i = html.indexOf(abschnitt)
    assert.notEqual(i, -1, `${abschnitt} fehlt`)
    const davor = html.slice(0, i)
    const offen = (davor.match(/<div class="container">/g) || []).length
    const zu = (davor.match(/<\/div>/g) || []).length
    assert.ok(offen > zu, `${abschnitt} steht außerhalb von .container`)
  }
})

test('der Fuß nennt die Dienste, aus denen die Daten stammen', () => {
  // Herkunftsangabe ist bei fremden Daten Pflicht, nicht Zierde.
  assert.match(html, /EUNIS|habitatus/i)
})

test('die Anker für app.js bleiben erhalten', () => {
  assert.match(html, /id="ansicht"/)
  assert.match(html, /id="meldungen"/)
  assert.match(html, /id="inhalt"/)
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `node --test test/layout.test.js`
Erwartet: FAIL — `<header` steht außerhalb von `.container`, `<footer` fehlt ganz.

- [ ] **Schritt 3: `index.html` umbauen**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Expertus — EUNIS-Habitate bestimmen</title>
    <link rel="stylesheet" href="/assets/designsystem.css" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="module" src="/src/app.js"></script>
  </head>
  <body>
    <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
    <div class="container">
      <header class="kopf">
        <div class="kopf-titel">
          <h1>Expertus</h1>
          <p class="muted">EUNIS-Habitate im Feld bestimmen</p>
        </div>
        <nav aria-label="Hauptnavigation">
          <a href="#/plots">Plots</a>
        </nav>
      </header>
      <main id="inhalt">
        <div id="ansicht"></div>
      </main>
      <footer class="fuss">
        <p class="muted">
          Habitatzuordnung über habitatus (EUNIS), Standortdaten über ortus,
          Artnamen über hostus.
        </p>
      </footer>
    </div>
    <div id="meldungen" role="status" aria-live="polite" class="visually-hidden"></div>
    <noscript>Expertus braucht JavaScript.</noscript>
  </body>
</html>
```

- [ ] **Schritt 4: Die Gerüstregeln ergänzen**

An `styles.css` anhängen:

```css
/* --- Seitengerüst --- */

/* Kopf, Inhalt und Fuß teilen sich .container aus dem Design-System und
   stehen damit in derselben Spur. Zuvor begann der Kopf am Fensterrand,
   während der Inhalt zentriert war — die Seite wirkte zerrissen. */

.kopf {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.kopf h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--accent);
}

.kopf-titel p {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
}

.kopf nav a {
  color: var(--accent);
}

.fuss {
  padding-top: 1rem;
  margin-top: 2.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
}

.fuss p {
  margin: 0;
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
node --test test/layout.test.js
make test
make a11y
```

Erwartet: grün.

- [ ] **Schritt 6: Mit eigenen Augen ansehen**

`make serve`, dann `http://127.0.0.1:5173`. Kopf, Inhalt und Fuß stehen jetzt
in einer Spur.

- [ ] **Schritt 7: Einchecken**

```bash
git add index.html styles.css test/layout.test.js
git commit -m "feat: Seitengerüst mit gemeinsamer Spur

Kopf und Inhalt standen in keiner Beziehung: der Kopf begann am
Fensterrand, der Inhalt 272 px weiter innen. Beide teilen sich jetzt
.container. Der Fuß nennt die Dienste, aus denen die Daten stammen."
```

---

### Aufgabe 7: Abschnitte als Karten

**Dateien:**
- Ändern: `src/views/plot-form.js`, `src/views/plot-list.js`
- Test: `e2e/layout.spec.js` (neu)

Behebt Punkt 2 des Befunds: „Standort", „Kopfdaten", „Arten" und
„Auswertung" sind heute gleichrangige Überschriften in einem Fluss, ohne
sichtbare Gruppierung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`e2e/layout.spec.js`:

```js
import { test, expect } from '@playwright/test'

test('die Abschnitte der Maske sind sichtbar getrennt', async ({ page }) => {
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()

  // Jeder Abschnitt trägt eine eigene Fläche; ohne sie verschwimmen
  // Standort, Kopfdaten, Arten und Auswertung zu einer einzigen Kolonne.
  const karten = page.locator('main section.card')
  await expect(karten).toHaveCount(4)

  for (const name of ['Standort', 'Kopfdaten', 'Arten', 'Auswertung']) {
    await expect(page.locator('section.card').filter({ hasText: name })).not.toHaveCount(0)
  }
})

test('die Übersicht trägt ihre Bedienleiste auf einer Fläche', async ({ page }) => {
  await page.goto('/index.html')
  await expect(page.locator('main .toolbar')).toHaveCount(1)
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx playwright test e2e/layout.spec.js`
Erwartet: FAIL — `toHaveCount(4)` findet 0, die Abschnitte tragen keine Klasse.

- [ ] **Schritt 3: Die Abschnitte umstellen**

In `src/views/plot-form.js`, Funktion `standort`:

```js
    return el('section', { class: 'card', 'aria-labelledby': 'h-standort' }, [
```

Funktion `kopfdaten`:

```js
  function kopfdaten(plot, pending) {
    return el('section', { class: 'card', 'aria-labelledby': 'h-kopf' }, [
      el('h3', { id: 'h-kopf', text: 'Kopfdaten' }),
      pending ? el('p', { class: 'muted', text: 'Kopfdaten werden geholt …' }) : null,
      // Eine breite Tabelle rollt in ihrem eigenen Kasten; die Seite selbst
      // darf nicht waagerecht rollen (WCAG 1.4.10).
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Feld', 'Wert', 'Herkunft'].map((t) => el('th', { scope: 'col', text: t })))),
        el('tbody', {}, HEADER_FIELDS.map((f) => zeile(plot, f))),
      ])),
    ])
  }
```

Die Funktion `feld` bekommt die Klasse des Design-Systems:

```js
  function feld(text, control) {
    return el('div', { class: 'form-group' }, [el('label', { for: control.id, text }), control])
  }
```

Der GPS-Knopf wird ein Zweitknopf:

```js
    const gps = el('button', {
      type: 'button', class: 'btn btn-secondary', text: 'Aktuellen Standort verwenden',
```

In `src/views/species-section.js` Zeile 26 — nur die Klasse kommt dazu, die
Kinder bleiben unverändert:

```js
  const node = el('section', { class: 'card', 'aria-labelledby': 'h-arten' }, [
```

In `src/views/result.js` ebenso:

```js
  const node = el('section', { class: 'card', 'aria-labelledby': 'h-ausw' }, [
```

In `src/views/plot-list.js` die Bedienleiste und den Hauptknopf:

```js
      el('div', { class: 'card toolbar' }, [
        el('button', { type: 'button', class: 'btn', text: 'Neuen Plot anlegen', onClick: () => {
```

und dort ebenfalls `labelled` auf die Klasse des Systems umstellen:

```js
  function labelled(text, control) {
    return el('div', { class: 'form-group' }, [el('label', { for: control.id, text }), control])
  }
```

Die Trefferliste bekommt ihren Rollkasten:

```js
    return el('div', { class: 'table-wrap' }, el('table', {}, [
```

- [ ] **Schritt 4: Die Leiste ordnen**

An `styles.css` anhängen:

```css
/* Suche, Filter und der Knopf zum Anlegen stehen nebeneinander, solange
   Platz ist, und untereinander, sobald nicht. */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
}

.toolbar .form-group {
  margin-bottom: 0;
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
npx playwright test e2e/layout.spec.js
make test
make e2e
make a11y
```

Erwartet: grün. Die bestehenden E2E-Tests sprechen Elemente über Rollen und
Beschriftungen an, nicht über Klassen — sie sollten unberührt bleiben.

- [ ] **Schritt 6: Einchecken**

```bash
git add src/views/ styles.css e2e/layout.spec.js
git commit -m "feat: Abschnitte der Maske auf eigenen Flächen

Standort, Kopfdaten, Arten und Auswertung verschwammen zu einer
einzigen Kolonne. Jeder Abschnitt trägt jetzt eine Karte, die
Kopfdatentabelle rollt in ihrem eigenen Kasten statt die Seite
waagerecht zu schieben."
```

---

### Aufgabe 8: Der ruhige Leerzustand

**Dateien:**
- Ändern: `src/format.js`, `src/views/plot-form.js`
- Test: `test/format.test.js` (bestehend, erweitern)

Behebt Punkt 3 des Befunds: bei einem frisch angelegten Plot steht siebenmal
„nicht ableitbar" in Warnfarbe untereinander — der normale Anfangszustand
sieht aus wie eine Fehlermeldung.

**Wichtig:** Der Zustandswert `'missing'` bleibt unangetastet. `newPlot()`
setzt ihn über `emptyOrigin()` für jedes Feld, und `missingFields()` in
`src/header-map.js` filtert genau darauf — er ist der Sperrmechanismus des
Auswerten-Knopfes. Würde er bei einem frischen Plot zu `'unknown'`, gäbe
`blockingReason()` den Knopf frei, obwohl keine Kopfdaten vorliegen. Geändert
wird deshalb **nur die Darstellung**.

Das Unterscheidungsmerkmal ist die Koordinate: ohne sie kann ortus nie
gefragt worden sein, also ist auch nichts fehlgeschlagen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `test/format.test.js` anhängen:

```js
test('vor dem ersten Abruf heißt ein fehlendes Kopfdatum "noch nicht abgefragt"', () => {
  // Vor dem ersten Abruf ist nichts fehlgeschlagen — es wurde nur noch
  // nicht gefragt. "nicht ableitbar" behauptete ein Ergebnis, das es nicht
  // gibt, und färbte die halbe Maske in Warnfarbe.
  assert.equal(originLabel('missing', false), 'noch nicht abgefragt')
  assert.equal(originLabel('missing', true), 'nicht ableitbar')
})

test('die übrigen Herkunftstexte hängen nicht am Abruf', () => {
  assert.equal(originLabel('ortus', false), 'aus ortus')
  assert.equal(originLabel('manual', false), 'von Hand gesetzt')
})

test('originLabel bleibt ohne zweites Argument rückwärtskompatibel', () => {
  assert.equal(originLabel('missing'), 'nicht ableitbar')
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `node --test test/format.test.js`
Erwartet: FAIL — `originLabel('missing', false)` liefert „nicht ableitbar".

- [ ] **Schritt 3: Den Text ergänzen**

In `src/format.js` — alle Oberflächentexte bleiben damit an einer Stelle, wie
der Kommentar am Dateianfang es verlangt:

```js
const ORIGIN = { ortus: 'aus ortus', manual: 'von Hand gesetzt', missing: 'nicht ableitbar' }
```

und `originLabel` ersetzen durch:

```js
// Der Zustandswert 'missing' trägt zwei verschiedene Bedeutungen: vor dem
// ersten Abruf wurde nur noch nicht gefragt, danach konnte das Feld nicht
// abgeleitet werden. Der Wert selbst bleibt gleich — er sperrt die
// Auswertung (siehe missingFields in header-map.js) und darf sich nicht
// ändern, nur weil die Maske ihn anders benennen will.
export const originLabel = (origin, abgefragt = true) =>
  origin === 'missing' && !abgefragt ? 'noch nicht abgefragt' : (ORIGIN[origin] ?? origin)
```

- [ ] **Schritt 4: Die Maske unterscheiden lassen**

In `src/views/plot-form.js`, Funktion `zeile`, die Zeile

```js
    const origin = plot.headerOrigin?.[field] ?? 'missing'
```

ergänzen um:

```js
    const origin = plot.headerOrigin?.[field] ?? 'missing'
    // Ohne Koordinate kann ortus nie gefragt worden sein: dann ist nichts
    // fehlgeschlagen und die Warnfarbe wäre eine Behauptung.
    const abgefragt = plot.coordinate != null
```

und die Herkunftszelle am Ende derselben Funktion ersetzen:

```js
      el('td', {
        class: origin === 'missing' && abgefragt ? 'warn' : 'muted',
        text: originLabel(origin, abgefragt),
      }),
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
make test
make e2e
make a11y
```

Erwartet: grün. Besonders `test/actions.test.js` muss unberührt bleiben — es
prüft an drei Stellen `headerOrigin.Country === 'missing'`, und genau dieser
Zustandswert wurde absichtlich nicht angefasst.

- [ ] **Schritt 6: Mit eigenen Augen ansehen**

`make serve`, neuen Plot anlegen. Die Herkunftsspalte ist jetzt ruhig und
sagt „noch nicht abgefragt". Erst nach dem Eintragen einer Koordinate — also
nach einem tatsächlichen Abruf — erscheint Warnfarbe bei den Feldern, die
wirklich nicht abgeleitet werden konnten. Der Auswerten-Knopf bleibt in
beiden Fällen gesperrt, wie zuvor.

- [ ] **Schritt 7: Einchecken**

```bash
git add src/format.js src/views/plot-form.js test/format.test.js
git commit -m "fix: Leerzustand der Kopfdaten nicht als Fehler zeigen

Ein frischer Plot zeigte siebenmal \"nicht ableitbar\" in Warnfarbe,
obwohl nichts fehlgeschlagen war — es war nur noch nicht gefragt worden.
Geändert wird allein die Beschriftung: der Zustandswert 'missing' sperrt
die Auswertung und bleibt deshalb, wie er ist."
```

---

### Aufgabe 9: Was als Nächstes zu tun ist

**Dateien:**
- Ändern: `src/views/result.js`
- Test: `e2e/result.spec.js` (bestehend, erweitern)

Behebt Punkt 4 des Befunds: unter dem gesperrten Knopf „Auswerten" steht als
Fließtext „Kopfdaten fehlen: Country, Coast_EEA, …" — die eigentliche
Handlungsaufforderung wird nachgereicht statt geführt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `e2e/result.spec.js` anhängen:

```js
test('der gesperrte Auswerten-Knopf nennt seinen Grund zugänglich', async ({ page }) => {
  await page.goto('/index.html')
  await page.getByRole('button', { name: 'Neuen Plot anlegen' }).click()

  const knopf = page.getByRole('button', { name: 'Auswerten' })
  await expect(knopf).toBeDisabled()

  // Ein gesperrter Knopf mit einer losen Textzeile darunter verbindet
  // beide nicht: wer nicht sieht, hört den Grund nie. aria-describedby
  // stellt die Verbindung her.
  const id = await knopf.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  await expect(page.locator(`#${id}`)).toContainText('Kopfdaten fehlen')
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx playwright test e2e/result.spec.js`
Erwartet: FAIL — `aria-describedby` fehlt.

- [ ] **Schritt 3: Die Verbindung herstellen**

In `src/views/result.js` trägt `grund` bereits den fertigen Text aus
`actions.blockingReason()` — er wird heute nur als lose Zeile unter dem Knopf
ausgegeben. Der Block am Anfang von `renderResultSection` wird ersetzt:

```js
export function renderResultSection({ plot, actions, store }) {
  const grund = actions.blockingReason()
  const ev = plot.evaluation
  const { evaluating } = store.get()

  // Der Grund für die Sperre gehört an den Knopf, nicht nur unter ihn: eine
  // lose Textzeile darunter wird beim Ansteuern des Knopfes nicht
  // vorgelesen, und wer nicht sieht, erfährt nie, was noch fehlt.
  const hinweisId = 'auswerten-grund'
  const hinweis = grund ? el('p', { id: hinweisId, class: 'muted', text: grund }) : null

  const node = el('section', { class: 'card', 'aria-labelledby': 'h-ausw' }, [
    el('h3', { id: 'h-ausw', text: 'Auswertung' }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: evaluating ? 'Wird ausgewertet …' : 'Auswerten',
      disabled: Boolean(grund) || evaluating,
      'aria-describedby': hinweis ? hinweisId : null,
      onClick: () => actions.evaluate(),
    }),
    hinweis,
    ergebnis(ev, actions),
    ev?.status === 'ok' || ev?.status === 'stale' ? anhang(ev) : null,
  ])

  // Der Abschnitt hält keine Ressourcen; die einheitliche Form hält die
  // Maske frei davon, zwei Rückgabearten unterscheiden zu müssen.
  return { node }
}
```

`el()` überspringt sowohl ein Attribut mit dem Wert `null` als auch ein Kind
mit dem Wert `null` — ohne Sperrgrund entfällt damit beides von selbst.

Der Knopf „Erneut versuchen" in `ergebnis()` bekommt dieselbe Klasse:

```js
      el('button', { type: 'button', class: 'btn btn-secondary', text: 'Erneut versuchen', onClick: () => actions.evaluate() }),
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

```bash
make test
make e2e
make a11y
```

Erwartet: grün.

- [ ] **Schritt 5: Einchecken**

```bash
git add src/views/result.js e2e/result.spec.js
git commit -m "fix: Grund der Sperre mit dem Auswerten-Knopf verbinden

Der Hinweis stand als lose Zeile unter dem Knopf und wurde beim
Ansteuern nicht vorgelesen. aria-describedby stellt die Verbindung her."
```

---

### Aufgabe 10: Abnahme

**Dateien:** keine Änderung — nur Prüfung.

- [ ] **Schritt 1: Die gesamte Prüfkette laufen lassen**

```bash
go test ./... -v
make test
make e2e
make a11y
make docker-test
gofmt -l .
```

Erwartet: alles grün, `gofmt -l` gibt nichts aus.

- [ ] **Schritt 2: Beide Themen ansehen**

`make serve`, dann `http://127.0.0.1:5173` einmal im hellen und einmal im
dunklen Systemthema durchgehen: Übersicht, leere Maske, Maske mit
eingetragener Koordinate, Maske mit Fehlermeldung.

- [ ] **Schritt 3: Auf dem Gerät gegenprüfen**

Im Browser die Gerätesimulation auf ein Telefon stellen und dieselben vier
Ansichten ansehen. Expertus ist eine Feldanwendung; die Handybreite ist der
Regelfall, nicht die Ausnahme.

Hinweis für den echten Test auf dem Telefon: Über die LAN-Adresse
(`http://192.168.x.x:5173`) bleibt die Standortermittlung stumm —
`navigator.geolocation` verlangt einen vertrauenswürdigen Kontext, den nur
HTTPS oder `localhost` erfüllen. Dafür braucht es ein lokales Zertifikat.

- [ ] **Schritt 4: Die Textgröße prüfen**

Im Browser auf 200 % Textgröße stellen (WCAG 1.4.4). Die Seite darf nicht
waagerecht rollen; breite Tabellen rollen in ihrem eigenen Kasten.

- [ ] **Schritt 5: Abschließend einchecken**

```bash
git add -A
git commit -m "chore: Abnahme der Umstellung auf Go und das Design-System"
```

---

### Aufgabe 11: Die eigene Combobox durch die des Moduls ersetzen

Expertus hat in `src/views/combobox.js` und `src/combobox-state.js` eine
sorgfältig gebaute Combobox — sie war die **Vorlage** für die des Moduls.
Jetzt liegt sie dort, geprüft und um zwei Punkte erweitert, die Expertus'
Fassung fehlen: ein konfigurierbarer Kennungspräfix (zwei Comboboxen auf
einer Seite kollidieren sonst) und ein `destroy()`, das auch die
Ereignishörer abmeldet.

**Zu tun:** `mountCombobox` aus `/assets/designsystem.js` beziehen statt aus
`src/views/combobox.js`. Die Schnittstelle ist:

```js
mountCombobox({ input, listbox, suggest, onPick, onError, debounceMs, idPrefix, clearOnPick })
```

`suggest` ist der Anknüpfungspunkt an die Fachlichkeit — dort bleibt Expertus'
Aufruf an hostus. `clearOnPick` steht auf `true`, was Expertus' Verhalten
entspricht (Art hinzufügen, Feld leeren).

**Wichtig:** `src/combobox-state.js` ist ohne Browser geprüft und hat eigene
Tests. Prüfe, ob die Zustandslogik des Moduls dieselben Fälle abdeckt, bevor
du die lokale Fassung löschst. Ergibt die Prüfung Lücken, melde sie — dann
gehört die Ergänzung ins Modul, nicht zurück nach Expertus.

Die bestehenden E2E-Tests der Artensuche (`e2e/species.spec.js`) sind das
Sicherheitsnetz: Sie müssen nach dem Wechsel unverändert grün sein.

---

## Was dieser Plan nicht enthält

- Die Anbindung von Situs. Vorbereitet ist nur der Platz dafür:
  `SITUS_BASE_URL` fließt bereits in CSP und `/config.json`, sobald die
  Variable gesetzt ist. Der Abruf selbst ist ein eigenes Vorhaben.
- Die Umstellung von Tempus, Ortus, Hostus und Situs auf das Design-System.
  Sie folgen der Reihenfolge aus dem Entwurf, jeweils als eigener Plan.
- Ein Umschalter für helles und dunkles Thema. Das System folgt der
  Systemeinstellung.
