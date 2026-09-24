// Package server liefert das Expertus-Frontend aus und übernimmt, was
// zuvor nginx tat: Konfiguration aus der Umgebung, Sicherheits-Header und
// den Rückfall auf index.html.
//
// Der Server terminiert kein TLS. Expertus läuft hinter Caddy, das die
// Verschlüsselung übernimmt; ein zweites Zertifikat hier wäre unbenutzt.
package server

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	designsystem "github.com/jobrunner/fieldworksdiary-designsystem"
	"github.com/jobrunner/fieldworksdiary-designsystem/icons"
)

// Config trägt die Adressen der Dienste, die das Frontend anspricht. Sie
// stehen an genau zwei Stellen: in /config.json, das die Anwendung liest,
// und in der CSP, die den Zugriff überhaupt erst erlaubt. Ein Dienst, der
// nur an einer der beiden Stellen steht, fällt im Betrieb aus.
type Config struct {
	OrtusBaseURL     string
	HabitatusBaseURL string
	HostusBaseURL    string
	// SitusBaseURL liefert die Angaben zu einem erkannten Habitattyp:
	// Name, Beschreibung, Pflanzengesellschaften und Arten nach Rolle.
	// Als einziger Dienst ist er freiwillig — ohne ihn fehlt nur dieser
	// Abschnitt, erfassen und auswerten gehen weiter. Leer bleibt die
	// Adresse aus CSP und /config.json heraus.
	SitusBaseURL string
	// Fassung steht in der Fußzeile. Sie kommt von außen (main.go liest
	// sie über expertus.Fassung() aus package.json) statt hier fest zu
	// stehen — sonst müsste dieses Paket bei jeder Freigabe geändert
	// werden, obwohl es mit der Versionsnummer selbst nichts zu tun hat.
	Fassung string
}

// New baut den Router. Das Dateisystem wird übergeben, nicht hier geholt:
// die Direktive go:embed kann nur unterhalb des eigenen Pakets einbetten,
// und ein übergebenes fs.FS macht die Tests unabhängig von der Einbettung.
func New(cfg Config, frontend fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/assets/designsystem.css", sicherheitsHeader(cfg, designSystemCSSHandler()))
	mux.Handle("/assets/designsystem.js", sicherheitsHeader(cfg, designSystemJSHandler()))
	mux.Handle("/assets/icons.js", sicherheitsHeader(cfg, iconsJSHandler()))
	mux.Handle("/config.json", sicherheitsHeader(cfg, configHandler(cfg)))
	mux.Handle("/", sicherheitsHeader(cfg, frontendHandler(cfg, frontend)))
	return mux
}

// designSystemCSSHandler liefert die gemeinsame Gestaltungsgrundlage. Sie
// kommt aus dem Modul, nicht aus diesem Repository: so bekommt Expertus
// Änderungen über einen Versionssprung statt über eine Kopie, die
// auseinanderläuft.
func designSystemCSSHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(designsystem.CSS())
	})
}

// designSystemJSHandler liefert das Combobox-Skript des Moduls unter
// demselben Ursprung — die CSP setzt keine eigene script-src-Regel, weil
// genau das reicht: default-src 'self' erlaubt diese Route bereits, ohne
// eine Lockerung eigens dafür einzuführen.
func designSystemJSHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(designsystem.JS())
	})
}

// verwendeteIcons listet die Symbole, die Expertus tatsächlich einsetzt —
// nicht icons.Alle(): das Modul trägt inzwischen 41 Symbole, und eine Seite
// bräuchte nur eines davon. Jedes trägt bereits die CSS-Klasse "icon", die
// das Design-System für Größe und Farbe erwartet (siehe icons.MitKlasse);
// das JavaScript muss diese Bauregel nicht kennen.
var verwendeteIcons = map[string]icons.Icon{
	"standort": icons.MitKlasse(icons.Standort(), "icon"),
}

// iconsJSHandler liefert die gebrauchten Symbole als ES-Modul mit
// benannten Exporten (`export const standort = "<svg …>"`).
//
// Das DOM entsteht in src/dom.js über el(), das Text ausschließlich über
// textContent setzt — nie über innerHTML, weil ein Artname aus hostus
// Fremdtext ist und eine Einschleusung sonst als Markup ausgeführt würde
// (siehe Kommentar in dom.js). Ein Symbol aus dem eigenen Design-System ist
// kein Fremdtext dieser Art: es kommt aus keiner Nutzereingabe und keiner
// Antwort eines fremden Dienstes, sondern aus demselben Ursprung wie
// designsystem.css und wird von diesem Server selbst erzeugt. Es als reinen
// String zu behandeln (etwa über textContent) würde das SVG genau wie
// html/template maskieren und sichtbaren Quelltext statt eines Symbols
// zeigen. Die Zeichenkette wird deshalb über JSON maskiert (schützt vor
// `</script>` und Kontrollzeichen im String-Literal) in ein eigenes
// ES-Modul geschrieben; src/dom.js bekommt dafür eine eigene, eng
// begrenzte Funktion (svgIcon), die ausdrücklich nur mit solchem
// vertrauten Markup aufgerufen wird — el() selbst bleibt unverändert bei
// textContent.
func iconsJSHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b strings.Builder
		for _, name := range []string{"standort"} {
			markup, _ := json.Marshal(string(verwendeteIcons[name]))
			b.WriteString("export const ")
			b.WriteString(name)
			b.WriteString(" = ")
			b.Write(markup)
			b.WriteString("\n")
		}
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write([]byte(b.String()))
	})
}

// frontendHandler liefert die eingebetteten Dateien und fällt auf
// index.html zurück, wenn ein Pfad nicht existiert — der Ersatz für
// try_files aus der nginx-Konfiguration.
func frontendHandler(cfg Config, frontend fs.FS) http.Handler {
	server := http.FileServer(http.FS(frontend))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pfad := strings.TrimPrefix(r.URL.Path, "/")
		if pfad == "" {
			pfad = "index.html"
		}
		// index.html wird nicht über http.FileServer ausgeliefert: der
		// leitet Anfragen auf eine Datei namens "index.html" per Redirect
		// auf "./" um, um doppelten Inhalt unter zwei Adressen zu
		// vermeiden — das führte hier zu einer Umleitungsschleife.
		if pfad == "index.html" {
			index(w, frontend, cfg)
			return
		}
		// Verzeichnisse werden nicht ausgeliefert: http.FileServer würde
		// sie auflisten und damit die Dateistruktur preisgeben.
		if info, err := fs.Stat(frontend, pfad); err != nil || info.IsDir() {
			index(w, frontend, cfg)
			return
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/" + pfad
		server.ServeHTTP(w, r2)
	})
}

// kopfPlatzhalter und fussPlatzhalter markieren die Stellen in index.html,
// an denen Kopf- und Fußzeile des Design-Systems eingesetzt werden.
// index.html bleibt damit statisch und lesbar, während das tatsächliche
// Markup aus designsystem.Kopfzeile()/Fusszeile() kommt — genau wie es
// demo/demo.go im Modul selbst vormacht (dort __KOPF__/__FUSS__ in
// demo/index.html). Ein von Hand nachgebautes <header>/<footer> in
// index.html könnte unbemerkt vom Markup des Moduls abweichen; ein
// Platzhalter kann das nicht.
const (
	kopfPlatzhalter = "__KOPF__"
	fussPlatzhalter = "__FUSS__"
)

// kopf liefert den Seitenkopf mit dem Namen der Anwendung. Anders als beim
// Design-System selbst (dessen Kopf nur den eigenen Namen trägt) braucht
// Expertus keine dienstspezifischen Angaben hier — die stehen im Fuß.
func kopf() designsystem.KopfDaten {
	return designsystem.KopfDaten{
		Name:       "Expertus",
		Untertitel: "EUNIS-Habitate im Feld bestimmen",
	}
}

// fuss liefert die Fußzeilendaten. Expertus hat kein /docs und kein
// /openapi.json wie die vier Go-Dienste, die das Design-System sonst
// einbinden — es liest fremde Daten von dreien von ihnen. "Nach oben" ist
// derselbe unauffällige Verweis wie in der Referenzseite des Moduls; die
// Herkunftsangabe der Daten steht als eigener Absatz neben der Fußzeile in
// index.html, weil FussDaten dafür kein Feld vorsieht (Verweise sind
// Verweise, keine Fließtext-Zeile) — ein Verweis mit dem Herkunftstext als
// Linktext und einem beliebigen Ziel wäre ein irreführender Link, keine
// Angabe.
func fuss(cfg Config) designsystem.FussDaten {
	return designsystem.FussDaten{
		Verweise: []designsystem.Verweis{
			{Text: "Nach oben", Ziel: "#inhalt"},
		},
		Name:    "expertus",
		Fassung: cfg.Fassung,
	}
}

func index(w http.ResponseWriter, frontend fs.FS, cfg Config) {
	daten, err := fs.ReadFile(frontend, "index.html")
	if err != nil {
		http.Error(w, "index.html fehlt", http.StatusInternalServerError)
		return
	}
	daten = bytes.ReplaceAll(daten, []byte(kopfPlatzhalter), []byte(designsystem.Kopfzeile(kopf())))
	daten = bytes.ReplaceAll(daten, []byte(fussPlatzhalter), []byte(designsystem.Fusszeile(fuss(cfg))))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Ohne Build gibt es keine Prüfsummen in Dateinamen — "immutable" wäre
	// falsch, eine neue Fassung würde nie ankommen.
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(daten)
}
