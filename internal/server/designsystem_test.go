package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	expertus "github.com/jobrunner/expertus"
)

// TestDesignSystemCSSWirdAusgeliefert prüft, dass die Route wirklich das
// zusammengesetzte Stylesheet des Moduls ausliefert — Tokens UND
// Basiskomponenten, nicht nur eine der beiden Dateien.
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
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	for _, teil := range []string{"--control-line:", ".card {"} {
		if !strings.Contains(string(body), teil) {
			t.Errorf("%q fehlt in der Antwort — es werden nicht beide Dateien ausgeliefert", teil)
		}
	}
}

// TestDesignSystemJSWirdAusgeliefert prüft dieselbe Zusage für das
// Combobox-Skript — ab Aufgabe 11 in Gebrauch, aber die Route muss vorher
// stehen und stabil bleiben.
func TestDesignSystemJSWirdAusgeliefert(t *testing.T) {
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/assets/designsystem.js")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("Status %d, erwartet 200", res.StatusCode)
	}
	if got := res.Header.Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q", got)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) == 0 {
		t.Error("Antwort ist leer")
	}
}

// TestIndexBindetDesignSystemEin stellt sicher, dass index.html das
// Design-System tatsächlich einbindet. Ohne diese Prüfung fiele die Seite
// beim nächsten Umbau unbemerkt auf ihre lokalen Reste zurück — der
// Verweis ist leicht zu verlieren, ein CSS-Import nicht.
func TestIndexBindetDesignSystemEin(t *testing.T) {
	srv := httptest.NewServer(New(Config{}, expertus.Frontend))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "/assets/designsystem.css") {
		t.Error("index.html verweist nicht auf das Design-System")
	}
}
