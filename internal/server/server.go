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
	mux.Handle("/config.json", sicherheitsHeader(cfg, configHandler(cfg)))
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
		// index.html wird nicht über http.FileServer ausgeliefert: der
		// leitet Anfragen auf eine Datei namens "index.html" per Redirect
		// auf "./" um, um doppelten Inhalt unter zwei Adressen zu
		// vermeiden — das führte hier zu einer Umleitungsschleife.
		if pfad == "index.html" {
			index(w, frontend)
			return
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
