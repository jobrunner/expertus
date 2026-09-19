.PHONY: test check serve docker docker-test a11y smoke e2e go-test

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
	npx playwright test e2e/a11y.spec.js
	@sh -c '\
		$(DEV_ENV) go run ./cmd/expertus >/dev/null 2>&1 & \
		srv=$$!; \
		trap "kill $$srv 2>/dev/null" EXIT; \
		for i in $$(seq 1 30); do curl -sf http://127.0.0.1:5173/index.html >/dev/null 2>&1 && break; sleep 0.2; done; \
		node scripts/axe-audit-routes.mjs \
	'

e2e:
	npx playwright test

docker:
	docker build -t expertus:dev .
	docker run --rm -p 8080:8080 expertus:dev

docker-test:
	sh e2e/container.sh
