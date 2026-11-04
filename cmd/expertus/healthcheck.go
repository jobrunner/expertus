package main

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// probeClient fragt nur diesen Container. http.DefaultClient beachtet
// HTTP_PROXY; ein in der Umgebung gesetzter Proxy bekäme sonst die Probe,
// und dessen 200 meldete den Container gesund, obwohl der Server steht.
var probeClient = &http.Client{
	Transport: &http.Transport{Proxy: nil},
}

// healthcheckTimeout begrenzt die Probe. Eine Probe, die hängt, ist eine
// Probe, die fehlschlägt — und das soll Docker schnell erfahren.
const healthcheckTimeout = 3 * time.Second

// healthcheck fragt GET / auf dem laufenden Server und meldet einen Fehler,
// wenn keine 200 kommt. Es gibt sie, weil das Abbild distroless ist: ohne
// Shell, ohne wget, ohne curl. Docker kann eine Probe nur im Container
// ausführen, und das Binärprogramm ist dort das einzige Ausführbare.
func healthcheck(addr string) error {
	ctx, cancel := context.WithTimeout(context.Background(), healthcheckTimeout)
	defer cancel()

	url := "http://" + addr + "/"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("healthcheck: %w", err)
	}
	resp, err := probeClient.Do(req)
	if err != nil {
		return fmt.Errorf("healthcheck: %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck: %s: Status %d, erwartet 200", url, resp.StatusCode)
	}
	return nil
}
