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
