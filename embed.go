// Package expertus bettet das Frontend ein. Es steht im Wurzelverzeichnis,
// weil go:embed nur Dateien unterhalb des eigenen Paketverzeichnisses
// aufnehmen kann — aus internal/server heraus wären index.html und src/
// unerreichbar.
package expertus

import (
	"embed"
	"encoding/json"
)

// Frontend enthält die Dateien unverändert. Damit bleibt gültig, was zuvor
// im Dockerfile stand: das Ausgelieferte ist identisch mit dem, was im
// Repository steht — es findet keine Umwandlung statt, nur ein Kopieren ins
// Binärprogramm.
//
//go:embed index.html styles.css src
var Frontend embed.FS

// paketJSON trägt nur die Fassungsnummer bei — sie steht bereits in
// package.json (dort liest sie auch der Docker-Release-Workflow für die
// Image-Tags). Eine zweite Stelle, an der dieselbe Zahl von Hand
// nachgetragen würde, liefe früher oder später auseinander.
//
//go:embed package.json
var paketJSON []byte

// Fassung liefert die Versionsnummer aus package.json. Sie steht in der
// Fußzeile der Anwendung (designsystem.FussDaten.Fassung) und kommt damit
// aus dem Bau, nicht aus einer erfundenen Konstante.
func Fassung() string {
	var p struct {
		Version string `json:"version"`
	}
	// Ein Fehler hier hieße, dass package.json fehlt oder kein gültiges
	// JSON ist — beides ein Programmierfehler, kein Laufzeitfall. Die
	// Fußzeile zeigt dann schlicht keine Fassungsnummer.
	_ = json.Unmarshal(paketJSON, &p)
	return p.Version
}
