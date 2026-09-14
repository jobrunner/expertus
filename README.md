# Legulus

Frontend zur Bestimmung von EUNIS-Habitaten im Feld. Erfasst einen Plot
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

## Dienste

| Dienst | Rolle | Vorgabe |
|---|---|---|
| ortus | Koordinate → Kopfdaten | `https://ortus.fieldworksdiary.org` |
| hostus | Autosuggest Pflanzennamen | `https://hostus.fieldworksdiary.org` |
| habitatus | Plot → EUNIS-Habitat | `https://habitatus.fieldworksdiary.org` |

Die Basis-URLs stehen nicht im Quelltext, sondern in `/config.json`; im
Container erzeugt der Entrypoint sie aus Umgebungsvariablen.

## Dokumente

- Design: `docs/superpowers/specs/2026-09-13-legulus-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-legulus.md`
