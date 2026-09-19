package server

import (
	"bytes"
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
		// ":root" stand hier, solange styles.css die Variablen selbst
		// definierte. Seit Aufgabe 5 kommen die aus
		// /assets/designsystem.css; styles.css trägt nur noch, was
		// Expertus darüber hinaus braucht.
		{"/styles.css", "text/css; charset=utf-8", ".visually-hidden"},
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
			buf := new(bytes.Buffer)
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
	buf := new(bytes.Buffer)
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
	buf := new(bytes.Buffer)
	buf.ReadFrom(res.Body)
	if strings.Contains(buf.String(), "app.js</a>") {
		t.Error("das Verzeichnis /src/ wurde aufgelistet")
	}
}
