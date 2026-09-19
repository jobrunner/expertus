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
