# Persona Platform — developer commands.
# Requires: docker compose, uv (api), pnpm (web), GNU make 4+.
# Recipes are plain commands so they work in cmd.exe, PowerShell, and sh.

.PHONY: dev api web infra down test test-api test-web lint lint-api lint-web migrate gen-client

## Run everything: Postgres + Redis in Docker, api (:8000) and web (:3000) as local processes.
dev: infra
	$(MAKE) -j2 api web

infra:
	docker compose up -d --wait db redis

api:
	cd api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd web && pnpm dev

down:
	docker compose down

## Tests
test: test-api test-web

test-api:
	cd api && uv run pytest

test-web:
	cd web && pnpm test

## Lint / type-check
lint: lint-api lint-web

lint-api:
	cd api && uv run ruff check .
	cd api && uv run ruff format --check .
	cd api && uv run mypy app migrations tests

lint-web:
	cd web && pnpm lint

## Database migrations (needs `make infra` or a reachable DATABASE_URL)
migrate:
	cd api && uv run alembic upgrade head

## Regenerate the TypeScript API client from the running api's OpenAPI schema.
gen-client:
	cd api && uv run python -m app.cli openapi > ../web/openapi.json
	cd web && pnpm gen-client
