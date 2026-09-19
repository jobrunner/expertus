package server

import "net/http"

// sicherheitsHeader wird in Aufgabe 3 gefüllt.
func sicherheitsHeader(cfg Config, next http.Handler) http.Handler {
	return next
}
