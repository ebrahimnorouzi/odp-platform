.PHONY: up down build restart logs shell-backend db-shell reset-db test-api help

# ─── Main commands ───────────────────────────────────────────────

up:         ## Start all services
	@cp -n .env.example .env 2>/dev/null || true
	docker compose up -d
	@echo ""
	@echo "  ✓ Platform running at http://localhost:$$(grep PORT .env | cut -d= -f2 | tr -d ' ' || echo 8080)"
	@echo "  ✓ API docs:        http://localhost:$$(grep PORT .env | cut -d= -f2 | tr -d ' ' || echo 8080)/api/docs"
	@echo "  ✓ Documentation:   http://localhost:$$(grep PORT .env | cut -d= -f2 | tr -d ' ' || echo 8080)/docs/"
	@echo ""

down:       ## Stop all services
	docker compose down

build:      ## Rebuild all images (no cache)
	docker compose build --no-cache

restart:    ## Restart all services
	docker compose restart

logs:       ## Follow logs from all services
	docker compose logs -f

logs-backend: ## Follow backend logs only
	docker compose logs -f backend

status:     ## Show service health
	docker compose ps

# ─── Development ─────────────────────────────────────────────────

shell-backend: ## Open a shell in the backend container
	docker compose exec backend /bin/bash

db-shell:   ## Open SQLite shell on the database
	docker compose exec backend python3 -c \
		"from database import engine; import sqlalchemy; \
		 conn = engine.connect(); \
		 [print(r) for r in conn.execute(sqlalchemy.text('SELECT * FROM surveys')).fetchall()]"

db-tables:  ## List database tables and row counts
	docker compose exec backend python3 -c "
from database import engine
import sqlalchemy
with engine.connect() as c:
    tables = ['surveys','evaluator_links','responses']
    for t in tables:
        n = c.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM {t}')).scalar()
        print(f'  {t}: {n} rows')
"

reset-db:   ## ⚠ Delete the database and restart (loses all data!)
	@echo "WARNING: This will delete ALL survey data. Press Ctrl+C to cancel..."
	@sleep 5
	docker compose down -v
	docker compose up -d

# ─── Testing ─────────────────────────────────────────────────────

test-api:   ## Quick API smoke test (requires curl + jq)
	@echo "Testing API health..."
	@curl -sf http://localhost:8080/api/health | python3 -m json.tool
	@echo ""
	@echo "Testing auth..."
	@TOKEN=$$(curl -sf -X POST http://localhost:8080/api/auth/token \
		-H "Content-Type: application/json" \
		-d '{"password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") && \
		echo "Token obtained: $${TOKEN:0:20}..." && \
		curl -sf http://localhost:8080/api/surveys \
		  -H "Authorization: Bearer $$TOKEN" | python3 -m json.tool | head -20

# ─── Backup ──────────────────────────────────────────────────────

backup:     ## Backup the database to ./backups/
	@mkdir -p backups
	@docker compose exec backend cp /data/odp_eval.db /data/odp_eval_backup.db
	@docker cp odp-backend:/data/odp_eval_backup.db backups/odp_eval_$$(date +%Y%m%d_%H%M%S).db
	@echo "Database backed up to ./backups/"

# ─── Sample data ─────────────────────────────────────────────────

seed:       ## Create a sample survey with the included sample.csv
	@echo "Creating sample survey..."
	@TOKEN=$$(curl -sf -X POST http://localhost:8080/api/auth/token \
		-H "Content-Type: application/json" \
		-d "{\"password\":\"$$(grep ADMIN_PASSWORD .env | cut -d= -f2 | tr -d ' ')\"}" \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") && \
		curl -sf -X POST http://localhost:8080/api/surveys \
		  -H "Authorization: Bearer $$TOKEN" \
		  -F "title=WOP 2023 ODP Evaluation" \
		  -F "description=Sample evaluation survey using WOP 2023 patterns" \
		  -F "n_per_evaluator=3" \
		  -F "n_evaluators=5" \
		  -F "csv_file=@sample.csv" | python3 -m json.tool

help:       ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
