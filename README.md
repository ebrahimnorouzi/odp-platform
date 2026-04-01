# ODP Evaluation Platform

> A containerised platform for structured human evaluation of Ontology Design Patterns.

---

## Quick Start

### 1. Configure

```bash
cp .env.example .env        # edit ADMIN_PASSWORD and SECRET_KEY
```

### 2. Build the image (once)

```bash
docker build -t odp-platform ./backend
```

> Only needs to re-run when `requirements.txt` changes.

### 3. Run

```bash
docker run -d \
  --name odp-backend \
  -p 8080:8080 \
  -v "$(pwd)/backend:/app" \
  -v odp_data:/data \
  --env-file .env \
  odp-platform \
  uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Platform is live at **http://localhost:8080**.

| URL | What |
|-----|------|
| `http://localhost:8080/` | Admin dashboard |
| `http://localhost:8080/evaluate?s=…` | Evaluator survey form |
| `http://localhost:8080/api/docs` | Swagger UI |

---

## Development — no rebuild or restart needed

The `-v "$(pwd)/backend:/app"` flag mounts your local `./backend/` folder directly into the container.

- **Python files** (`.py`): uvicorn detects changes and reloads automatically (~1 s).
- **Static files** (`.js`, `.html`, `.css`): served from disk — just refresh the browser.
- **No `docker cp`**, no `docker restart`, no rebuild.

```bash
# stop
docker stop odp-backend

# start again (keeps the same container + volume)
docker start odp-backend

# view logs
docker logs -f odp-backend
```

---

## Makefile shortcuts

```bash
make build           # build the image
make up              # create and start the container
make down            # stop the container
make restart         # restart the container
make logs            # follow logs
make shell-backend   # open shell inside the container
make backup          # copy database to ./backups/
make seed            # create a sample survey from sample.csv
make test-api        # smoke-test the API
make help            # list all commands
```

---

## CSV Format

Minimum required columns:

```csv
title,Scenario
"Causality Pattern","It is rainy season, the sprinkler is on..."
```

### Supported columns

| Column | Required | Notes |
|--------|----------|-------|
| `title` | ✓ | Pattern display name |
| `Scenario` | ✓ | Shown as the main text block |
| `scenario_id` | — | Unique ID used for question-set assignment |
| `year` | — | Shown as a badge |
| `pdf_link` | — | Linked as "📄 Paper" |
| `ODPs links` | — | Linked as "🔗 ODP Wiki" |
| `CQs` | — | Competency questions block |
| `Type` | — | Badge (ODP, Ontology, etc.) |
| `include_in_eval` | — | Set `no` to exclude a row |
| `*_link` | — | Any column ending `_link` becomes a card button |

---

## Per-pattern question sets

Different evaluator groups (authors vs. experts) can see different question templates:

1. Open a survey → **Questions** tab
2. Click **＋ Add Set** and name it (e.g. `author`, `expert`)
3. Upload a JSON file or edit questions inline for each set
4. In the **Pattern → Question Set** table, assign each pattern to the right set
5. Unassigned patterns use **Default**

The mapping tolerates partial `scenario_id` matches — e.g. a map entry for `2023-133` also matches patterns whose ID starts with `2023-133-`.

---

## Export columns

```
response_id, survey_id, survey_title,
session_id, session_num, evaluator_token,
pattern_id, pattern_title, pattern_link,
started_at, completed_at, duration_ms, duration_human,
submitted_at, session_duration_ms, session_duration_human,
q_<id>  × all questions across all sets
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD` | `admin123` | Admin login password |
| `SECRET_KEY` | `change-me…` | JWT signing secret |
| `BASE_URL` | `http://localhost:8080` | Used to build evaluator links |
| `PORT` | `8080` | Host port |
| `TOKEN_EXPIRE_HOURS` | `24` | JWT token lifetime |

---

## Production checklist

- [ ] Change `ADMIN_PASSWORD` and `SECRET_KEY` in `.env`
- [ ] Set `BASE_URL` to your public domain
- [ ] Put a reverse proxy (Caddy / Nginx) with TLS in front
- [ ] Remove `--reload` and the `-v "$(pwd)/backend:/app"` bind-mount from the run command
- [ ] Schedule regular `make backup` runs

---

## Project structure

```
odp-platform/
├── .env.example
├── Makefile
├── sample.csv
│
└── backend/                  ← mounted live into the container at /app
    ├── main.py
    ├── database.py
    ├── schemas.py
    ├── auth.py
    ├── requirements.txt
    ├── Dockerfile
    ├── routers/
    │   ├── surveys.py
    │   ├── responses.py
    │   └── export.py
    └── static/
        ├── index.html
        ├── evaluate.html
        ├── css/style.css
        └── js/
            ├── utils.js
            ├── api.js
            ├── admin.js
            └── evaluate.js
```
