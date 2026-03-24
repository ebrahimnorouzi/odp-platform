"""
Surveys router — admin only (JWT required).
  POST   /api/surveys                   create + upload CSV
  GET    /api/surveys                   list all
  GET    /api/surveys/{id}              detail with patterns
  PATCH  /api/surveys/{id}              update title/desc/columns/questions/n_per
  POST   /api/surveys/{id}/upload-csv   replace CSV
  POST   /api/surveys/{id}/publish      draft → published  (generates public_slug + URL)
  POST   /api/surveys/{id}/unpublish    published → paused
  DELETE /api/surveys/{id}              delete
"""
import csv, io, json, os
from datetime import datetime
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from database import get_db, Survey, make_slug
from schemas import SurveyOut, SurveyDetail, SurveyUpdate
from auth import get_current_admin

router = APIRouter(prefix="/api/surveys", tags=["surveys"])

BASE_URL = os.getenv("BASE_URL", "http://localhost:8080")

DEFAULT_QUESTIONS = [
    {"id":"q_clarity",      "type":"likert",   "label":"Scenario Clarity",
     "help":"How clear and understandable is the problem scenario?",
     "scale":5,"labels":["Very Unclear","Very Clear"],"required":True},
    {"id":"q_completeness", "type":"likert",   "label":"Scenario Completeness",
     "help":"Does the scenario capture all key requirements?",
     "scale":5,"labels":["Very Incomplete","Very Complete"],"required":True},
    {"id":"q_cq_relevance", "type":"likert",   "label":"CQ Relevance",
     "help":"Are the competency questions relevant to the scenario?",
     "scale":5,"labels":["Not Relevant","Fully Relevant"],"required":True},
    {"id":"q_cq_correct",   "type":"likert",   "label":"CQ Correctness",
     "help":"Do the CQs correctly represent the stated requirements?",
     "scale":5,"labels":["Incorrect","Fully Correct"],"required":True},
    {"id":"q_missing",      "type":"textarea", "label":"Missing CQs",
     "help":"List any competency questions you feel are missing.","required":False},
    {"id":"q_comments",     "type":"textarea", "label":"General Comments",
     "help":"Any other feedback on this pattern.","required":False},
]


# ── helpers ───────────────────────────────────────────────────────────────

def parse_csv(content: bytes) -> tuple[list[dict], list[str]]:
    text    = content.decode("utf-8-sig")
    reader  = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows    = list(reader)

    scenario_col = next((h for h in headers if h.strip().lower() == "scenario"), None)

    patterns = []
    for i, row in enumerate(rows):
        row = {k: (v or "").strip() for k, v in row.items()}
        if row.get("include_in_eval", "").lower() == "no":
            continue
        title = row.get("title") or row.get("Title") or (list(row.values())[0] if row else "")
        if not title:
            continue
        if scenario_col and not row.get(scenario_col, "").strip():
            continue
        row["_id"] = i
        patterns.append(row)

    return patterns, headers


def auto_display_cols(headers: list[str]) -> list[str]:
    priority = ["title","scenario","Scenario","CQs","cqs","year","Type","type","pdf_link","ODPs links"]
    seen, cols = set(), []
    for p in priority:
        for h in headers:
            if h.lower() == p.lower() and h not in seen:
                cols.append(h); seen.add(h)
    return cols or headers[:6]


def public_url(slug: str, req: Request | None = None) -> str:
    base = str(req.base_url).rstrip("/") if req else BASE_URL
    return f"{base}/evaluate?s={slug}"


def to_out(s: Survey, req: Request | None = None) -> SurveyOut:
    url = public_url(s.public_slug, req) if s.public_slug else None
    return SurveyOut(
        id=s.id, title=s.title, description=s.description,
        csv_filename=s.csv_filename, status=s.status,
        public_slug=s.public_slug, public_url=url,
        created_at=s.created_at, updated_at=s.updated_at,
        published_at=s.published_at,
        pattern_count=s.pattern_count, session_count=s.session_count,
        response_count=s.response_count, completed_count=s.completed_count,
        display_columns=s.display_columns, questions=s.questions,
        settings=s.settings,
    )


# ── list ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SurveyOut])
def list_surveys(request: Request, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    surveys = db.query(Survey).order_by(Survey.created_at.desc()).all()
    return [to_out(s, request) for s in surveys]


@router.get("/{sid}", response_model=SurveyDetail)
def get_survey(sid: int, request: Request, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404, "Survey not found")
    d = to_out(s, request).model_dump()
    d["patterns"] = s.patterns
    return SurveyDetail(**d)


# ── create ────────────────────────────────────────────────────────────────

@router.post("", response_model=SurveyOut, status_code=201)
def create_survey(
    request:         Request,
    title:           str        = Form(...),
    description:     str        = Form(""),
    n_per_evaluator: int        = Form(3),
    csv_file:        UploadFile = File(...),
    db:              Session    = Depends(get_db),
    _=Depends(get_current_admin),
):
    content  = csv_file.file.read()
    patterns, headers = parse_csv(content)
    if not patterns:
        raise HTTPException(400, "No valid patterns found — ensure rows have a non-empty Scenario column.")

    s = Survey(title=title, description=description, csv_filename=csv_file.filename or "upload.csv")
    s.patterns        = patterns
    s.display_columns = auto_display_cols(headers)
    s.questions       = DEFAULT_QUESTIONS
    s.settings        = {"n_per_evaluator": min(n_per_evaluator, len(patterns)), "csv_headers": headers}
    db.add(s); db.commit(); db.refresh(s)
    return to_out(s, request)


# ── update ────────────────────────────────────────────────────────────────

@router.patch("/{sid}", response_model=SurveyOut)
def update_survey(
    sid: int, body: SurveyUpdate, request: Request,
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404)
    if body.title           is not None: s.title           = body.title
    if body.description     is not None: s.description     = body.description
    if body.display_columns is not None: s.display_columns = body.display_columns
    if body.questions       is not None: s.questions       = [q.model_dump() for q in body.questions]
    if body.n_per_evaluator is not None:
        cfg = s.settings; cfg["n_per_evaluator"] = min(body.n_per_evaluator, s.pattern_count); s.settings = cfg
    s.updated_at = datetime.utcnow()
    db.commit(); db.refresh(s)
    return to_out(s, request)


# ── re-upload CSV ─────────────────────────────────────────────────────────

@router.post("/{sid}/upload-csv", response_model=SurveyOut)
def upload_csv(
    sid: int, request: Request,
    csv_file: UploadFile = File(...),
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404)
    content  = csv_file.file.read()
    patterns, headers = parse_csv(content)
    if not patterns: raise HTTPException(400, "No valid patterns found in CSV")
    s.patterns    = patterns
    s.csv_filename = csv_file.filename or s.csv_filename
    cfg = s.settings
    cfg["csv_headers"]    = headers
    cfg["n_per_evaluator"] = min(cfg.get("n_per_evaluator", 3), len(patterns))
    s.settings   = cfg
    s.updated_at = datetime.utcnow()
    db.commit(); db.refresh(s)
    return to_out(s, request)


# ── publish / unpublish ───────────────────────────────────────────────────

@router.post("/{sid}/publish", response_model=SurveyOut)
def publish_survey(
    sid: int, request: Request,
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404)
    if not s.patterns: raise HTTPException(400, "Upload a CSV before publishing")
    if not s.questions: raise HTTPException(400, "Add evaluation questions before publishing")

    if not s.public_slug:
        # generate a unique slug
        for _ in range(10):
            slug = make_slug()
            if not db.query(Survey).filter(Survey.public_slug == slug).first():
                s.public_slug = slug; break
        else:
            raise HTTPException(500, "Could not generate a unique slug")

    s.status       = "published"
    s.published_at = s.published_at or datetime.utcnow()
    s.updated_at   = datetime.utcnow()
    db.commit(); db.refresh(s)
    return to_out(s, request)


@router.post("/{sid}/unpublish", response_model=SurveyOut)
def unpublish_survey(
    sid: int, request: Request,
    db: Session = Depends(get_db), _=Depends(get_current_admin),
):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404)
    s.status     = "paused"
    s.updated_at = datetime.utcnow()
    db.commit(); db.refresh(s)
    return to_out(s, request)


# ── delete ────────────────────────────────────────────────────────────────

@router.delete("/{sid}", status_code=204)
def delete_survey(sid: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    s = db.get(Survey, sid)
    if not s: raise HTTPException(404)
    db.delete(s); db.commit()
