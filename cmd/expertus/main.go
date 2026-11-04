// Startet den Expertus-Server. Die Adressen der Dienste kommen aus der
// Umgebung, damit dieselbe Abbildung in jeder Umgebung läuft.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	expertus "github.com/jobrunner/expertus"
	"github.com/jobrunner/expertus/internal/server"
)

func main() {
	health := flag.Bool("healthcheck", false,
		"GET / auf 127.0.0.1:$PORT prüfen und mit 0 oder 1 enden, statt zu "+
			"starten; für den HEALTHCHECK im distroless-Abbild ohne wget/curl")
	flag.Parse()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if *health {
		if err := healthcheck("127.0.0.1:" + port); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
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
