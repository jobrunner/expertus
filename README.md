# Expertus

PoC-Frontend (Vorstudie) zur Bestimmung von EUNIS-Habitaten im Feld. Erfasst einen Plot
(Koordinate, Sample-ID, Artenliste mit Deckung), holt die Standort-Kopfdaten
aus ortus, lässt ihn von habitatus klassifizieren und speichert ihn lokal.

Vanilla-SPA aus nativen ES-Modulen **ohne Build-Schritt**: was im Repository
liegt, wird ausgeliefert.

## Entwickeln

```sh
git clone --recurse-submodules <url>   # das Skill-Submodul wird gebraucht
make test     # Unit-Suite
make serve    # lokaler Statik-Server auf :5173
make check    # Pre-Merge-Gate: test + a11y
```

| Befehl                                 | Wirkung                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `make test`                          | Unit-Suite (`node:test`), kein Netz, kein Browser         |
| `make e2e`                           | Oberflächentests im Browser gegen Stubs                    |
| `make a11y`                          | WCAG-2.2-AA-Gate: Grep, axe über die schwierigen Zustände |
| `make check`                         | Pre-Merge-Gate: `test` + `a11y`                          |
| `make smoke`                         | Abgleich gegen die **echten** Dienste; nicht in der CI |
| `make docker` / `make docker-test` | Image bauen, starten, prüfen                               |

## Dienste

| Dienst    | Rolle                     | Vorgabe                                                         |
| --------- | ------------------------- | --------------------------------------------------------------- |
| ortus     | Koordinate → Kopfdaten   | `Ortus mit den entsprechenden für Gazetteer und GeoPackages` |
| hostus    | Autosuggest Pflanzennamen | `Hostus mit Euro+Med Plantbase und WCVP`                      |
| habitatus | Plot → EUNIS-Habitat     | `Habitatus (ESy-Portierung)`                                  |
| situs     | Habitattyp → Hintergrund | `Situs mit EUNIS-Typologien, Syntaxa und Crosswalks`          |

Die Basis-URLs stehen nicht im Quelltext. Der Go-Server liest sie beim Start
aus Umgebungsvariablen und liefert sie unter `/config.json` aus, das die
Anwendung im Browser als Erstes holt. Ein Entrypoint-Skript gibt es nicht —
der Container startet das Binary unmittelbar.

| Variable               | Dienst    | Pflicht |
| ---------------------- | --------- | ------- |
| `ORTUS_BASE_URL`       | ortus     | ja      |
| `HABITATUS_BASE_URL`   | habitatus | ja      |
| `HOSTUS_BASE_URL`      | hostus    | ja      |
| `SITUS_BASE_URL`       | situs     | nein    |

Fehlt eine der drei Pflichtadressen, **startet der Server dennoch** und
antwortet auf allen Routen; nur nennt `/config.json` den betroffenen Dienst
dann nicht. Abgelehnt wird erst im Browser: Die Anwendung prüft die
Konfiguration beim Start und zeigt statt der Maske die Meldung
`config.json unvollständig: ortusBaseUrl`.

Dass dort kein Standardwert einspringt, ist Absicht — er liefe gegen den
falschen Dienst, und das fiele erst am falschen Ergebnis auf.

**situs ist als einziger Dienst freiwillig.** Er liefert die
Hintergrundinformationen zu einem bestimmten Habitat: Name und Beschreibung
des Lebensraumtyps, seine Syntaxa (Pflanzengesellschaften) und seine Arten
nach Rolle — diagnostisch, konstant, dominant. Ohne ihn fehlt in der
Auswertung genau dieser Abschnitt; erfassen und auswerten gehen unverändert
weiter. Bleibt `SITUS_BASE_URL` leer, nennt weder `/config.json` noch die
CSP den Dienst.

Abgefragt wird `GET /v1/habitat-type/eunis@2021/{code}`. Die Typologie steht
fest auf EUNIS 2021: habitatus nennt sein Regelwerk, aber keine
EUNIS-Fassung, und situs bezieht seine Beschreibungen aus den
EUNIS-Factsheets von 2021.

## Auslieferung

Veröffentlicht wird aus Git-Tags: ein `v*`-Tag baut das Image für amd64 und
arm64, prüft es mit `make docker-test`, führt beide zu einem Multi-Arch-Index
zusammen, signiert ihn schlüssellos mit cosign und bezeugt Provenance und
SBOM gegen dessen Digest (`.github/workflows/docker-release.yml`).

```sh
git tag v0.1.0 && git push origin v0.1.0
```

```sh
docker run -p 8080:8080 \
  -e ORTUS_BASE_URL=https://ortus.example \
  -e HABITATUS_BASE_URL=https://habitatus.example \
  -e HOSTUS_BASE_URL=https://hostus.example \
  -e SITUS_BASE_URL=https://situs.example \
  ghcr.io/jobrunner/expertus:0.1.0
```

Signatur und Bezeugungen prüfen:

```sh
cosign verify ghcr.io/jobrunner/expertus:0.1.0 \
  --certificate-identity-regexp 'https://github.com/jobrunner/expertus/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/jobrunner/expertus:0.1.0 -R jobrunner/expertus
```

## Dokumente

Entwurfsstände, keine laufende Dokumentation: Sie halten fest, wie das
Vorhaben zum jeweiligen Zeitpunkt geplant war, und werden nicht rückwirkend
nachgezogen. Was gilt, steht in diesem README, in den Kommentaren am Code
und in den Tests. Der Design-Entwurf vom 13.09. kennt situs deshalb noch
nicht — der Dienst kam später hinzu.

- Design: `docs/superpowers/specs/2026-09-13-expertus-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-expertus.md`
- Plan (Go-Server und Design-System): `docs/superpowers/plans/2026-09-17-expertus-go-und-designsystem.md`
