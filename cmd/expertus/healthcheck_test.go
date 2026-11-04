package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Nur 200 gilt als gesund. Alles andere — auch ein Server, der antwortet,
// aber nicht mit der Startseite — muss scheitern, sonst meldet die Probe
// einen Container gesund, der nichts ausliefern kann.
func TestHealthcheckStatus(t *testing.T) {
	for _, tc := range []struct {
		name    string
		status  int
		wantErr bool
	}{
		{name: "ok", status: http.StatusOK},
		{name: "nicht gefunden", status: http.StatusNotFound, wantErr: true},
		{name: "Serverfehler", status: http.StatusInternalServerError, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// Über einen Kanal statt einer geteilten Variable: Der Handler
			// läuft in der Goroutine des Servers.
			paths := make(chan string, 1)
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				paths <- r.URL.Path
				w.WriteHeader(tc.status)
			}))
			defer srv.Close()

			err := healthcheck(strings.TrimPrefix(srv.URL, "http://"))
			if tc.wantErr && err == nil {
				t.Fatalf("Status %d angenommen, Fehler erwartet", tc.status)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("Status %d: %v", tc.status, err)
			}
			if got := <-paths; got != "/" {
				t.Errorf("Pfad %q geprüft, erwartet /", got)
			}
		})
	}
}

// Läuft kein Server, muss die Probe scheitern statt zu hängen.
func TestHealthcheckOhneServer(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	addr := strings.TrimPrefix(srv.URL, "http://")
	srv.Close()

	if err := healthcheck(addr); err == nil {
		t.Fatal("Probe ohne Server erfolgreich, Fehler erwartet")
	}
}
