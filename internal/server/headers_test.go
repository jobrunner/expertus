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
