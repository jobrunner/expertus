// Startet den Expertus-Server. Die Adressen der Dienste kommen aus der
// Umgebung, damit dieselbe Abbildung in jeder Umgebung läuft.
package main

import (
	"log"
	"net/http"
	"os"

	expertus "github.com/jobrunner/expertus"
	"github.com/jobrunner/expertus/internal/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	cfg := server.Config{
		OrtusBaseURL:     os.Getenv("ORTUS_BASE_URL"),
		HabitatusBaseURL: os.Getenv("HABITATUS_BASE_URL"),
		HostusBaseURL:    os.Getenv("HOSTUS_BASE_URL"),
		SitusBaseURL:     os.Getenv("SITUS_BASE_URL"),
		// Aus package.json, nicht hier erfunden — siehe expertus.Fassung().
		Fassung: expertus.Fassung(),
	}
	log.Printf("Expertus auf :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, server.New(cfg, expertus.Frontend)))
}
