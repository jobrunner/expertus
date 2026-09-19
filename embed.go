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
