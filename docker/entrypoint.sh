#!/bin/sh
# Erzeugt config.json aus der Umgebung. Läuft vor nginx, im
# docker-entrypoint.d-Verzeichnis des Basis-Images.
set -eu

cat > /usr/share/nginx/html/config.json <<JSON
{
  "ortusBaseUrl": "${ORTUS_BASE_URL}",
  "habitatusBaseUrl": "${HABITATUS_BASE_URL}",
  "hostusBaseUrl": "${HOSTUS_BASE_URL}"
}
JSON
