package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	expertus "github.com/jobrunner/expertus"
	designsystem "github.com/jobrunner/fieldworksdiary-designsystem"
)

// TestIndexSetztKopfUndFussEin belegt, dass die ausgelieferte Seite das
// tatsächliche Markup von designsystem.Kopfzeile()/Fusszeile() trägt,
// nicht ein von Hand nachgebautes — dieselbe Schummelklasse, gegen die
// demo_test.go im Modul mit TestDemoRuftKopfzeileUndFusszeileTatsaechlichAuf
// schützt. Geprüft wird über die genauen Fassungen, weil ein zufällig
// gleich aussehendes Markup so nicht bestehen könnte.
func TestIndexSetztKopfUndFussEin(t *testing.T) {
	cfg := Config{Fassung: "9.9.9"}
	srv := httptest.NewServer(New(cfg, expertus.Frontend))
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
	html := string(body)

	for _, teil := range []string{
		string(designsystem.Kopfzeile(kopf())),
		string(designsystem.Fusszeile(fuss(cfg))),
	} {
		if !strings.Contains(html, teil) {
			t.Errorf("die Seite enthält nicht das von Kopfzeile()/Fusszeile() erzeugte Markup:\n%s", teil)
		}
	}
	if strings.Contains(html, kopfPlatzhalter) || strings.Contains(html, fussPlatzhalter) {
		t.Error("ein Platzhalter (__KOPF__/__FUSS__) blieb in der ausgelieferten Seite stehen")
	}
	if !strings.Contains(html, "9.9.9") {
		t.Error("die konfigurierte Fassungsnummer kommt in der Antwort nicht vor")
	}
}

// TestKopfUndFussLiegenNichtInnerhalbVonMain belegt Punkt 1 des Befunds:
// <header> begann am Fensterrand, während <main> zentriert war. Die Prüfung
// stellt sicher, dass die Behebung nicht denselben Fehler an anderer Stelle
// wiederholt: <header> und <footer> dürfen nicht innerhalb von <main>
// stehen — sonst verlieren sie ihre Landmarkenfunktion für Screenreader,
// ein Fehler, der dem Design-System selbst an dieser Stelle schon einmal
// passiert ist (siehe demo/index.html im Modul).
func TestKopfUndFussLiegenNichtInnerhalbVonMain(t *testing.T) {
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
	html := string(body)

	iHeader := strings.Index(html, "<header")
	iMainOpen := strings.Index(html, "<main")
	iMainClose := strings.Index(html, "</main>")
	iFooter := strings.Index(html, "<footer")
	for name, i := range map[string]int{"<header": iHeader, "<main": iMainOpen, "</main>": iMainClose, "<footer": iFooter} {
		if i < 0 {
			t.Fatalf("%s kommt in der Antwort nicht vor", name)
		}
	}
	if !(iHeader < iMainOpen) {
		t.Errorf("<header> (%d) steht nicht vor <main> (%d)", iHeader, iMainOpen)
	}
	if !(iMainClose < iFooter) {
		t.Errorf("<footer> (%d) steht nicht nach </main> (%d) — es liegt innerhalb von <main>", iFooter, iMainClose)
	}
}

// TestKopfInhaltUndFussTeilenSichDenContainer belegt die Behebung selbst:
// header, main und footer liegen in derselben Spur wie das Design-System
// sie über .container vorgibt, statt der Kopf am Fensterrand zu beginnen,
// während der Inhalt 272px weiter innen zentriert ist.
func TestKopfInhaltUndFussTeilenSichDenContainer(t *testing.T) {
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
	html := string(body)

	start := strings.Index(html, `<div class="container">`)
	if start < 0 {
		t.Fatal(`<div class="container"> fehlt`)
	}
	ende := schliessendesDiv(html, start)
	if ende < 0 {
		t.Fatal("das schließende </div> von .container wurde nicht gefunden")
	}
	for _, abschnitt := range []string{"<header", "<main", "<footer"} {
		i := strings.Index(html, abschnitt)
		if i < 0 {
			t.Fatalf("%s fehlt", abschnitt)
		}
		if !(start < i && i < ende) {
			t.Errorf("%s steht außerhalb von .container", abschnitt)
		}
	}
}

// schliessendesDiv findet das zu html[start:] gehörende schließende </div>,
// indem es die Verschachtelungstiefe zählt statt naiv den nächsten
// </div>-Treffer zu nehmen — Kopfzeile() liefert selbst ein verschachteltes
// <div class="ds-kopf-titel">…</div>, das sonst fälschlich als Ende von
// .container durchginge.
func schliessendesDiv(html string, start int) int {
	rest := html[start:]
	tiefe := 0
	i := 0
	for i < len(rest) {
		open := strings.Index(rest[i:], "<div")
		close := strings.Index(rest[i:], "</div>")
		if close < 0 {
			return -1
		}
		if open >= 0 && open < close {
			tiefe++
			i += open + len("<div")
			continue
		}
		tiefe--
		i += close + len("</div>")
		if tiefe == 0 {
			return start + i - len("</div>")
		}
	}
	return -1
}

// TestFussNenntDieHerkunftDerDaten hält fest, dass Expertus — anders als
// die vier Go-Dienste mit /docs und /openapi.json — bei fremden Daten eine
// Herkunftsangabe zeigt: Habitatzuordnung über habitatus, Standortdaten
// über ortus, Artnamen über hostus.
func TestFussNenntDieHerkunftDerDaten(t *testing.T) {
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
	html := string(body)
	for _, teil := range []string{"habitatus", "ortus", "hostus"} {
		if !strings.Contains(html, teil) {
			t.Errorf("die Seite nennt %q nicht als Datenquelle", teil)
		}
	}
}

// TestAnkerFuerAppJsBleibenErhalten stellt sicher, dass der Umbau die
// Kennungen nicht verschoben oder umbenannt hat, auf die app.js sich
// verlässt (#inhalt, #ansicht, #meldungen).
func TestAnkerFuerAppJsBleibenErhalten(t *testing.T) {
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
	html := string(body)
	for _, id := range []string{`id="inhalt"`, `id="ansicht"`, `id="meldungen"`} {
		if !strings.Contains(html, id) {
			t.Errorf("%s fehlt", id)
		}
	}
}

// TestSprunglinkIstErstesFokussierbaresElement prüft, dass der Sprunglink
// unmittelbar hinter dem öffnenden <body> steht — vor <header>, dem
// unmittelbar folgenden fokussierbaren Element. Ein Sprunglink, der später
// im Dokument steht, ist funktionslos: Tab hat ihn bis dahin überholt.
func TestSprunglinkIstErstesFokussierbaresElement(t *testing.T) {
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
	html := string(body)

	iBody := strings.Index(html, "<body>")
	iSkip := strings.Index(html, `class="skip-link"`)
	iHeader := strings.Index(html, "<header")
	if iBody < 0 || iSkip < 0 || iHeader < 0 {
		t.Fatal("<body>, .skip-link oder <header fehlt in der Antwort")
	}
	if !(iBody < iSkip && iSkip < iHeader) {
		t.Errorf("Reihenfolge <body>(%d) < .skip-link(%d) < <header(%d) nicht erfüllt", iBody, iSkip, iHeader)
	}
}
