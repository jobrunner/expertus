.PHONY: test check serve docker docker-test a11y smoke e2e go-test

# Testläufe bekommen einen eigenen Port. Auf 5173 läuft der von Hand
# gestartete Entwicklungsserver; prüfte ein Testlauf gegen ihn, prüfte er
# einen fremden Stand — bei den Oberflächentests mit einer CSP, die auf die
# echten Dienste zeigt statt auf die *.test-Adressen der Stubs.
TEST_PORT ?= 5174

# Automatisierte Läufe starten den Server mit denselben Adressen, die
# e2e/helpers/stubs.js stubbt. Mit den echten Adressen aus DEV_ENV wäre auf
# dem Testport ein Server gelandet, dessen CSP nicht zu den Tests passt —
# genau der Fall, den e2e/helpers/pruefe-server.js meldet.
TEST_ENV = ORTUS_BASE_URL=https://ortus.test \
           HABITATUS_BASE_URL=https://habitatus.test \
           HOSTUS_BASE_URL=https://hostus.test \
           SITUS_BASE_URL=https://situs.test

DEV_ENV = ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
          HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
          HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
          PORT=5173

test:
	node --test $$(find test -name '*.test.js' | sort)

go-test:
	go test ./... -v

check: test go-test a11y

serve:
	$(DEV_ENV) go run ./cmd/expertus

smoke:
	node scripts/smoke.mjs

a11y:
	.claude/skills/web-accessibility-audit/scripts/a11y-grep.sh --all . --strict
	E2E_PORT=$(TEST_PORT) npx playwright test e2e/a11y.spec.js
	@sh -c '\
		if lsof -ti tcp:$(TEST_PORT) >/dev/null 2>&1; then \
			echo "Port $(TEST_PORT) ist belegt — die Prüfung liefe gegen einen fremden Server."; \
			echo "Beende ihn oder rufe make a11y TEST_PORT=<frei> auf."; \
			exit 1; \
		fi; \
		bin=$$(mktemp -d)/expertus; \
		go build -o $$bin ./cmd/expertus; \
		$(TEST_ENV) PORT=$(TEST_PORT) $$bin >/dev/null 2>&1 & \
		srv=$$!; \
		trap "kill $$srv 2>/dev/null" EXIT INT TERM; \
		for i in $$(seq 1 30); do curl -sf http://127.0.0.1:$(TEST_PORT)/index.html >/dev/null 2>&1 && break; sleep 0.2; done; \
		BASE_URL=http://127.0.0.1:$(TEST_PORT) node scripts/axe-audit-routes.mjs \
	'

e2e:
	E2E_PORT=$(TEST_PORT) npx playwright test

docker:
	docker build -t expertus:dev .
	docker run --rm -p 8080:8080 expertus:dev

docker-test:
	sh e2e/container.sh
