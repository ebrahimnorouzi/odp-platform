.PHONY: build up up-prod down restart logs logs-backend status shell-backend db-shell db-tables reset-db backup seed test-api help

IMAGE   = odp-platform
CONTAINER = odp-backend
PORT    ?= 8080

# Load .env values if the file exists (for ADMIN_PASSWORD etc.)
-include .env
export

# ─── Core ────────────────────────────────────────────────────────

build:          ## Build the Docker image (run once, then again only if requirements.txt changes)
	docker build -t $(IMAGE) ./backend

up:             ## Create and start the container (bind-mounts ./backend for live edits)
	@cp -n .env.example .env 2>/dev/null || true
	@docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d \
	  --name $(CONTAINER) \
	  -p $(PORT):8080 \
	  -v "$(CURDIR)/backend:/app" \
	  -v odp_data:/data \
	  --env-file .env \
	  $(IMAGE) \
	  uvicorn main:app --host 0.0.0.0 --port 8080 --reload
	@echo ""
	@echo "  Platform running at http://localhost:$(PORT)"
	@echo "  API docs:          http://localhost:$(PORT)/api/docs"
	@echo "  Edits to ./backend are live immediately (no restart needed)"
	@echo ""

up-prod:        ## Start in production mode (no bind-mount, no --reload, auto-restart)
	@cp -n .env.example .env 2>/dev/null || true
	@docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d \
	  --name $(CONTAINER) \
	  --restart unless-stopped \
	  -p $(PORT):8080 \
	  -v odp_data:/data \
	  --env-file .env \
	  $(IMAGE) \
	  uvicorn main:app --host 0.0.0.0 --port 8080 --workers 2
	@echo ""
	@echo "  Platform running at http://localhost:$(PORT)  [production mode]"
	@echo ""

down:           ## Stop the container
	docker stop $(CONTAINER)

restart:        ## Restart the container
	docker restart $(CONTAINER)

logs:           ## Follow container logs
	docker logs -f $(CONTAINER)

logs-backend:   ## Alias for logs
	docker logs -f $(CONTAINER)

status:         ## Show container status
	docker ps --filter name=$(CONTAINER) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# ─── Development ─────────────────────────────────────────────────

shell-backend:  ## Open a shell inside the container
	docker exec -it $(CONTAINER) /bin/bash

db-shell:       ## Query the database
	docker exec $(CONTAINER) python3 -c \
		"from database import engine; import sqlalchemy; \
		 conn = engine.connect(); \
		 [print(r) for r in conn.execute(sqlalchemy.text('SELECT id,title,status,pattern_count,response_count FROM surveys')).fetchall()]"

db-tables:      ## Show row counts per table
	docker exec $(CONTAINER) python3 -c "
from database import engine
import sqlalchemy
with engine.connect() as c:
    for t in ['surveys','eval_sessions','responses']:
        try:
            n = c.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM {t}')).scalar()
            print(f'  {t}: {n} rows')
        except: pass
"

reset-db:       ## ⚠ Delete the database volume and restart (loses all data!)
	@echo "WARNING: This will delete ALL data. Press Ctrl+C to cancel..."
	@sleep 5
	docker stop $(CONTAINER) 2>/dev/null || true
	docker rm   $(CONTAINER) 2>/dev/null || true
	docker volume rm odp_data 2>/dev/null || true
	$(MAKE) up

# ─── Backup ──────────────────────────────────────────────────────

backup:         ## Backup the database to ./backups/
	@mkdir -p backups
	@docker exec $(CONTAINER) cp /data/odp_eval.db /data/odp_eval_backup.db
	@docker cp $(CONTAINER):/data/odp_eval_backup.db backups/odp_eval_$$(date +%Y%m%d_%H%M%S).db
	@echo "Database backed up to ./backups/"

# ─── Sample data ─────────────────────────────────────────────────

seed:           ## Create a sample survey with sample.csv
	@echo "Creating sample survey..."
	@TOKEN=$$(curl -sf -X POST http://localhost:$(PORT)/api/auth/token \
		-H "Content-Type: application/json" \
		-d "{\"password\":\"$${ADMIN_PASSWORD:-admin123}\"}" \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") && \
		curl -sf -X POST http://localhost:$(PORT)/api/surveys \
		  -H "Authorization: Bearer $$TOKEN" \
		  -F "title=WOP 2023 ODP Evaluation" \
		  -F "description=Sample evaluation survey" \
		  -F "n_per_evaluator=3" \
		  -F "csv_file=@sample.csv" | python3 -m json.tool

# ─── Testing ─────────────────────────────────────────────────────

test-api:       ## Quick API smoke test
	@echo "Testing health..."
	@curl -sf http://localhost:$(PORT)/api/health | python3 -m json.tool
	@echo ""
	@echo "Testing auth..."
	@TOKEN=$$(curl -sf -X POST http://localhost:$(PORT)/api/auth/token \
		-H "Content-Type: application/json" \
		-d "{\"password\":\"$${ADMIN_PASSWORD:-admin123}\"}" \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") && \
		echo "Token: $${TOKEN:0:20}..." && \
		curl -sf http://localhost:$(PORT)/api/surveys \
		  -H "Authorization: Bearer $$TOKEN" | python3 -m json.tool | head -20

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
