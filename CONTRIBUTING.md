# Beitragen

## Sprache

**Commit-Nachrichten auf Englisch.** Alles andere auf Deutsch.

Das ist keine halbe Sache, sondern hat einen Grund je Seite:

- **Commits** folgen Conventional Commits, und die Prüfregel `subject-case`
  verlangt einen kleingeschriebenen Betreff. Im Englischen folgt nach
  `fix(ci): ` ein kleingeschriebenes Verb, im Deutschen stünde dort
  regelmäßig ein großgeschriebenes Substantiv. Die Regel ist Teil von
  `@commitlint/config-conventional` und wird in Ortus, Tempus und Hostus
  ebenso angewendet — Expertus hält es genauso.

- **Kommentare im Code, Dokumentation und die Oberfläche** bleiben deutsch.
  Das ist die Sprache des Vorhabens und der Anwenderinnen im Gelände. Ein
  Kommentar erklärt, *warum* etwas so ist; er richtet sich an die Menschen,
  die hier arbeiten.

Beispiele:

    fix(server): keep index.html out of the file server redirect loop
    feat(icons): add crosshair icon for the location button
    chore(deps): bump golang from 1.21-alpine to 1.25-alpine

## Commit-Typen

`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, `test` — siehe `.commitlintrc.yml`.

release-please leitet daraus die nächste Fassung ab: `feat` ergibt einen
Minor-, `fix` einen Patch-Sprung, `!` oder `BREAKING CHANGE` einen Major-
Sprung. Ein Commit mit falschem Typ verschiebt die Fassungsnummer.

## Prüfungen vor einem Pull Request

    make check        # Go-Tests, JS-Tests, Barrierefreiheit
    make e2e          # Oberflächentests gegen Attrappen
    make docker-test  # Container baut und antwortet

Die CI führt dieselben Ziele aus — es gibt nur eine Definition davon.
