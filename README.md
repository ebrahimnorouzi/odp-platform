# ODP Evaluation Platform

> A fully containerised, production-ready platform for structured human evaluation of Ontology Design Patterns.

---

## Capabilities

| Capability | Details |
|---|---|
| **Multi-survey management** | Create unlimited independent surveys, each with their own CSV, questions, links, and results |
| **CSV upload & re-upload** | Upload any CSV at creation time; re-upload new CSVs to an existing survey at any time without losing responses |
| **Auto-detection** | Platform auto-detects rows with `Scenario` content; skips rows with `include_in_eval=no` |
| **Random assignment** | Each evaluator receives a configurable random subset of N patterns; re-generate more links anytime |
| **Configurable questions** | 5 question types per survey: Likert (3–7pt with custom labels), text, textarea, boolean, select |
| **Persistent storage** | SQLite database backed by a Docker volume — survives container restarts and rebuilds |
| **Real-time submission** | Evaluators submit directly to the API — no file download/email required |
| **Duplicate prevention** | Each evaluator link can only be submitted once; re-opening shows a "already submitted" notice |
| **Time tracking** | Per-pattern start/end times, duration in ms and human-readable; total session duration |
| **Progress tracking** | Admin dashboard shows link open rate and completion rate per survey in real time |
| **Statistics dashboard** | Per-question Likert distributions, mean ± σ; per-pattern score heatmap |
| **CSV export** | Full flat file: evaluator metadata + all timing + all question answers, UTF-8 with BOM |
| **Excel export** | `.xlsx` with styled header, `All Responses` sheet + `Question Summary` sheet |
| **Admin authentication** | JWT password auth, configurable via env var, 24h token expiry |
| **REST API** | Full OpenAPI spec at `/api/docs`, ReDoc at `/api/redoc` |
| **Documentation site** | MkDocs Material site compiled into a Docker container, served at `/docs/` |
| **Fully containerised** | Single-service Docker Compose: FastAPI/uvicorn; one command to start |

---

## Quick Start

### 1. Configure

```bash
git clone https://github.com/yourname/odp-platform.git
cd odp-platform
cp .env.example .env        # edit ADMIN_PASSWORD and SECRET_KEY
```

### 2. Build & run

```bash
docker build -t odp-platform ./backend
docker run -d \
  --name odp-backend \
  -p 8080:8080 \
  -v odp_data:/data \
  -e ADMIN_PASSWORD=admin123 \
  -e SECRET_KEY=change-me-in-production \
  -e BASE_URL=http://localhost:8080 \
  odp-platform
```

| URL | What |
|-----|------|
| `http://localhost:8080/` | Admin dashboard |
| `http://localhost:8080/evaluate?token=…` | Evaluator survey form |
| `http://localhost:8080/api/docs` | Swagger UI |

### 3. Create your first survey

1. Open `http://localhost:8080` and log in (default: `admin123`)
2. Click **New Survey**
3. Set title, upload your CSV, set patterns-per-evaluator
4. Click **Open** on the new survey → **Links & Assignment** tab
5. Click **Generate More Links** → choose number of evaluators
6. Copy and distribute the generated links

### 4. Collect responses

Evaluators open their link, complete the form, and submit. Responses are saved immediately to the database.

### 5. Export results

Go to the survey → click **⬇ CSV** or **⬇ Excel**.

---

## CSV Format

Minimum required columns:

```csv
title,Scenario
"Causality Pattern","It is rainy season, the sprinkler is on..."
```

### All supported columns

| Column | Required | Notes |
|--------|----------|-------|
| `title` | ✓ | Pattern display name |
| `Scenario` | ✓ | Shown to evaluators as the main text block |
| `year` | — | Shown as a badge |
| `pdf_link` | — | Linked as "📄 Paper" |
| `ODPs links` | — | Linked as "🔗 ODP Wiki" |
| `CQs` | — | Competency questions block |
| `Type` | — | Badge (ODP, Ontology, etc.) |
| `include_in_eval` | — | Set `no` to exclude a row |
| `display_label` | — | Override title shown to evaluators |

Any other columns you add will be available to select as display columns.

---

## Export CSV Columns

```
survey_id, survey_title,
evaluator_id, evaluator_num, evaluator_label,
pattern_id, pattern_title,
started_at, completed_at, duration_ms, duration_human,
submitted_at, session_duration_ms, session_duration_human,
q_<question_id>  × N questions
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD` | `admin123` | Admin login password |
| `SECRET_KEY` | `change-me…` | JWT signing secret |
| `BASE_URL` | `http://localhost:8080` | Used to build evaluator links |
| `PORT` | `8080` | External port |
| `TOKEN_EXPIRE_HOURS` | `24` | JWT token lifetime |

---

## Makefile Commands

```bash
make up              # Start everything
make down            # Stop
make build           # Rebuild images
make logs            # Follow all logs
make status          # Container health
make shell-backend   # Shell into backend
make db-tables       # Show row counts per table
make backup          # Backup database to ./backups/
make seed            # Create a sample survey from sample.csv
make test-api        # Smoke test the API
make help            # List all commands
```

---

## Managing Multiple CSVs

Since each survey is independent:

- **Different papers/years** → create separate surveys, each with their own CSV
- **Updated patterns** → use **Re-upload CSV** button on a survey (preserves existing responses + links)
- **Combined export** → export each survey's CSV separately; they all use the same schema so you can `cat` or `rbind` them

---

## Production Checklist

- [ ] Change `ADMIN_PASSWORD` in `.env`
- [ ] Set `SECRET_KEY` to a random 32+ char string
- [ ] Set `BASE_URL` to your public domain
- [ ] Set up a reverse proxy with HTTPS (Traefik / Caddy example in `docs/`)
- [ ] Enable database backups (`make backup` or mount `/data` to a backed-up volume)

---

## Project Structure

```
odp-platform/
├── .env.example              ← Copy to .env
├── Makefile                  ← Dev shortcuts
├── sample.csv                ← 14 ODP patterns for testing
│
└── backend/                  ← FastAPI application
    ├── main.py               ← App entry point
    ├── database.py           ← SQLAlchemy models (Survey, Link, Response)
    ├── schemas.py            ← Pydantic v2 schemas
    ├── auth.py               ← JWT authentication
    ├── requirements.txt
    ├── Dockerfile
    ├── routers/
    │   ├── surveys.py        ← CRUD + CSV upload + link generation
    │   ├── responses.py      ← Evaluate + submit + stats
    │   └── export.py         ← CSV and Excel export
    └── static/               ← Frontend SPA
        ├── index.html        ← Admin dashboard
        ├── evaluate.html     ← Evaluator form
        ├── css/style.css     ← Design system
        └── js/
            ├── utils.js      ← Shared utilities
            ├── api.js        ← API client (fetch wrapper)
            ├── admin.js      ← Admin UI logic
            └── evaluate.js   ← Evaluator form logic
```
