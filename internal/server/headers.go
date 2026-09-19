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
//
// Es steht bewusst keine eigene script-src-Regel hier: ohne sie fällt
// jedes Skript auf default-src 'self' zurück, und das reicht bereits für
// das Combobox-Skript des Designsystems (Aufgabe 5) — es kommt von einer
// eigenen, selbst ausgelieferten Route unter demselben Ursprung. Eine
// Lockerung wäre also gar nicht nötig; es genügt, sie später nicht
// versehentlich zu verbauen.
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
