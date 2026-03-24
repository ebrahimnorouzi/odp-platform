"""
ODP Evaluation Platform — FastAPI Application
Serves the REST API + static frontend files.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from database import init_db, get_db
from auth import ADMIN_PASSWORD, create_access_token, get_current_admin
from schemas import LoginRequest, TokenResponse
from routers import surveys as surveys_router
from routers import responses as responses_router
from routers import export as export_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="ODP Evaluation Platform",
    description="API for managing ontology design pattern evaluation surveys.",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS (allow frontend on same origin + localhost dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(surveys_router.router)
app.include_router(responses_router.router)
app.include_router(export_router.router)


# ─── Auth ─────────────────────────────────────────────────────────

@app.post("/api/auth/token", response_model=TokenResponse, tags=["auth"])
def login(body: LoginRequest):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Incorrect password")
    token = create_access_token({"role": "admin", "sub": "admin"})
    return TokenResponse(access_token=token)


@app.get("/api/auth/me", tags=["auth"])
def me(payload=Depends(get_current_admin)):
    return {"role": payload.get("role"), "status": "authenticated"}


# ─── Health ───────────────────────────────────────────────────────

@app.get("/api/health", tags=["system"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return JSONResponse({"status": "error", "db": str(e)}, status_code=500)


@app.get("/api/info", tags=["system"])
def info():
    return {
        "name": "ODP Evaluation Platform",
        "version": "2.0.0",
        "capabilities": [
            "multi-survey management",
            "CSV upload with auto-detection",
            "random pattern assignment per evaluator",
            "configurable evaluation questions (likert/text/textarea/boolean/select)",
            "persistent response storage (SQLite)",
            "per-pattern and per-question statistics",
            "CSV and Excel export with timing metadata",
            "JWT admin authentication",
            "MkDocs documentation site",
        ]
    }


# ─── Static files (must be last) ──────────────────────────────────

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

SAMPLE_CSV = os.path.join(os.path.dirname(__file__), "..", "sample.csv")

if os.path.isdir(STATIC_DIR):
    # Serve SPA pages explicitly so they work with query-param routing
    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/evaluate", include_in_schema=False)
    def evaluate_page():
        return FileResponse(os.path.join(STATIC_DIR, "evaluate.html"))

    # Serve sample CSV for download
    @app.get("/sample.csv", include_in_schema=False)
    def sample_csv():
        path = SAMPLE_CSV if os.path.exists(SAMPLE_CSV) else os.path.join(STATIC_DIR, "sample.csv")
        if not os.path.exists(path):
            return JSONResponse({"error": "sample.csv not found"}, status_code=404)
        return FileResponse(path, media_type="text/csv", filename="sample.csv")

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
