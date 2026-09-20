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

## Pull Requests zusammenführen

Vor dem Zusammenführen auf `origin/main` rebasen, dann mit **Merge-Commit**
zusammenführen — nicht squashen. Der Rebase hält die Historie geradlinig, der
Merge-Commit hält sichtbar, welche Commits zu welchem Pull Request gehörten.
Ein Squash wirft beides zusammen: Beim Umbau in #6 verschwand dabei ein
`fix(ratchet):` unter einer `refactor:`-Betreffzeile, und release-please sah
nichts zu veröffentlichen — kein Release, kein Tag, kein Container-Image.

**Der Titel eines Pull Requests darf kein Conventional Commit sein.**

GitHub schreibt ihn als Rumpf in den Merge-Commit, und release-please liest
auch Rümpfe. Ein Titel wie `fix(plot-list): keep focus …` erscheint dann
zweimal im Changelog — einmal für den Commit, einmal für den Merge-Commit.
Die drei von GitHub erlaubten Kombinationen aus Merge-Betreff und -Rumpf
führen alle dorthin, sobald der Titel ein Conventional Commit ist; die
Einstellung ist also kein Ausweg.

Titel deshalb in normaler Sprache schreiben:

    ✅ Keep focus in the plot list search field
    ❌ fix(plot-list): keep focus in the search field while typing

`commitlint` prüft ausschließlich die Commits eines Pull Requests, nie
dessen Titel — die Prüfungen stehen dem also nicht entgegen.

Beim Zusammenführen über die Kommandozeile zusätzlich den Rumpf leeren:

    gh pr merge <N> --merge --delete-branch --body ""

## Prüfungen vor einem Pull Request

    make check        # Go-Tests, JS-Tests, Barrierefreiheit
    make e2e          # Oberflächentests gegen Attrappen
    make docker-test  # Container baut und antwortet

Die CI führt dieselben Ziele aus — es gibt nur eine Definition davon.
