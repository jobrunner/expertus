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

Die Basis-URLs stehen nicht im Quelltext, sondern in `/config.json`; im
Container erzeugt der Entrypoint sie aus Umgebungsvariablen.

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
  -e ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
  -e HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
  -e HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
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

- Design: `docs/superpowers/specs/2026-09-13-expertus-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-expertus.md`
