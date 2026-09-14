.PHONY: test check serve docker docker-test a11y smoke e2e

test:
	node --test $$(find test -name '*.test.js' | sort)

check: test a11y

serve:
	python3 -m http.server 5173

smoke:
	node scripts/smoke.mjs

a11y:
	.claude/skills/web-accessibility-audit/scripts/a11y-grep.sh --all . --strict

e2e:
	npx playwright test

docker:
	docker build -t legulus:dev .
	docker run --rm -p 8080:8080 legulus:dev

docker-test:
	sh e2e/container.sh
