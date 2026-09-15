#!/bin/sh
# Prüft das gebaute Image: Konfiguration aus Umgebungsvariablen, CSP-Kopf,
# Nicht-Root, kein Caching der HTML-Seite.
set -eu

docker build -q -t expertus:test . >/dev/null
cid=$(docker run -d -p 18080:8080 \
  -e ORTUS_BASE_URL=https://ortus.example \
  -e HABITATUS_BASE_URL=https://habitatus.example \
  -e HOSTUS_BASE_URL=https://hostus.example \
  expertus:test)
trap 'docker rm -f "$cid" >/dev/null' EXIT

for _ in $(seq 30); do
  curl -sf http://127.0.0.1:18080/index.html >/dev/null && break
  sleep 0.5
done

echo "1..6"

curl -sf http://127.0.0.1:18080/config.json | grep -q 'https://ortus.example' \
  && echo "ok 1 config.json kommt aus der Umgebung" || { echo "not ok 1"; exit 1; }

curl -sfI http://127.0.0.1:18080/index.html | grep -qi 'content-security-policy' \
  && echo "ok 2 CSP-Kopf gesetzt" || { echo "not ok 2"; exit 1; }

# Die App darf nur die konfigurierten Dienste erreichen dürfen — sonst
# blockiert die eigene Richtlinie genau das, was man eingestellt hat.
curl -sfI http://127.0.0.1:18080/index.html | grep -i 'content-security-policy' | grep -q 'https://habitatus.example' \
  && echo "ok 3 connect-src nennt die konfigurierten Dienste" || { echo "not ok 3"; exit 1; }

curl -sfI http://127.0.0.1:18080/index.html | grep -qi 'cache-control: no-cache' \
  && echo "ok 4 HTML wird nicht gecacht" || { echo "not ok 4"; exit 1; }

[ "$(docker exec "$cid" id -u)" != "0" ] \
  && echo "ok 5 Prozess läuft nicht als root" || { echo "not ok 5"; exit 1; }

curl -sf http://127.0.0.1:18080/src/app.js >/dev/null \
  && echo "ok 6 Module werden ausgeliefert" || { echo "not ok 6"; exit 1; }
