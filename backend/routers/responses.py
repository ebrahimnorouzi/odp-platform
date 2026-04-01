"""
Public evaluator endpoints + admin stats with scientific inter-rater agreement.
"""
import math, random, statistics
from collections import defaultdict
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Survey, EvalSession, Response
from schemas import StartSessionOut, SubmitResponses, ResponseOut, SurveyStats, QuestionStat, PatternStat
from auth import get_current_admin

router = APIRouter(tags=["responses"])


# ── Inter-rater agreement helpers ─────────────────────────────────────────

def krippendorffs_alpha(data: list[list[Optional[float]]], level="ordinal") -> Optional[float]:
    """
    Compute Krippendorff's Alpha for reliability.
    data: list of units (patterns), each a list of rater values (None = missing).
    level: 'nominal' | 'ordinal' | 'interval'
    Returns alpha in [-1, 1] or None if not computable.
    """
    # Flatten to list of (unit, rater, value)
    units = []
    for ui, rater_vals in enumerate(data):
        for ri, v in enumerate(rater_vals):
            if v is not None:
                units.append((ui, ri, float(v)))

    n_pairable = sum(
        1 for ui in range(len(data))
        for vi, (u1,_,v1) in enumerate(units) if u1==ui
        for u2,_,v2 in units[vi+1:] if u2==ui
    )
    if n_pairable < 1:
        return None

    # Coincidence matrix approach
    all_vals = sorted(set(v for _,_,v in units))
    if len(all_vals) < 2:
        return None

    # n_u = number of values per unit
    n_unit = defaultdict(list)
    for ui, ri, v in units:
        n_unit[ui].append(v)

    # Observed disagreement (Do)
    Do = 0.0
    n_total = 0
    for ui, vals in n_unit.items():
        m = len(vals)
        if m < 2: continue
        for c, vc in enumerate(vals):
            for k, vk in enumerate(vals):
                if c == k: continue
                Do += delta(vc, vk, level) / (m - 1)
        n_total += m

    if n_total < 2:
        return None
    Do /= n_total

    # Expected disagreement (De) using distribution of all values
    all_values_flat = [v for vals in n_unit.values() for v in vals]
    N = len(all_values_flat)
    De = 0.0
    for vc in all_values_flat:
        for vk in all_values_flat:
            De += delta(vc, vk, level)
    De /= N * (N - 1)

    if De == 0:
        return None
    return round(1.0 - Do / De, 4)


def delta(v1, v2, level):
    if level == "nominal":
        return 0.0 if v1 == v2 else 1.0
    elif level == "interval":
        return (v1 - v2) ** 2
    else:  # ordinal — default
        return (v1 - v2) ** 2


def fleiss_kappa(data: list[list[Optional[int]]], n_categories: int) -> Optional[float]:
    """
    Fleiss' Kappa for multiple raters, fixed categories.
    data: list of subjects, each a list of integer category ratings (None = missing).
    """
    subjects = []
    for rater_vals in data:
        vals = [v for v in rater_vals if v is not None]
        if not vals: continue
        subjects.append(vals)

    if len(subjects) < 2: return None

    N = len(subjects)
    cats = list(range(1, n_categories + 1))

    # n_ij = count of raters assigning subject i to category j
    mat = []
    for vals in subjects:
        row = {c: vals.count(c) for c in cats}
        mat.append(row)

    n_raters = max(sum(row.values()) for row in mat)
    if n_raters < 2: return None

    # P_j = proportion of all assignments to category j
    total_assignments = N * n_raters
    P_j = {}
    for c in cats:
        P_j[c] = sum(row.get(c, 0) for row in mat) / total_assignments

    # P_i = proportion agreement for subject i
    P_bar = 0.0
    for row in mat:
        n_i = sum(row.values())
        if n_i < 2:
            P_bar += 0
            continue
        s = sum(n * (n - 1) for n in row.values())
        P_bar += s / (n_i * (n_i - 1))
    P_bar /= N

    P_e = sum(p ** 2 for p in P_j.values())
    if P_e == 1.0: return None
    return round((P_bar - P_e) / (1.0 - P_e), 4)


def interpret_alpha(alpha: Optional[float]) -> str:
    if alpha is None: return "insufficient data"
    if alpha >= 0.80: return "strong agreement"
    if alpha >= 0.67: return "tentative agreement"
    if alpha >= 0.00: return "weak agreement"
    return "no agreement"

def interpret_kappa(k: Optional[float]) -> str:
    if k is None: return "insufficient data"
    if k > 0.80:  return "almost perfect"
    if k > 0.60:  return "substantial"
    if k > 0.40:  return "moderate"
    if k > 0.20:  return "fair"
    if k > 0.00:  return "slight"
    return "poor"

def median_val(vals):
    if not vals: return None
    s = sorted(vals)
    n = len(s)
    return s[n//2] if n % 2 else (s[n//2-1]+s[n//2])/2

def iqr_val(vals):
    if len(vals) < 4: return None
    s = sorted(vals)
    n = len(s)
    q1 = s[n//4]; q3 = s[3*n//4]
    return round(q3 - q1, 3)

def ci95(vals):
    """95% confidence interval for the mean."""
    n = len(vals)
    if n < 2: return None, None
    m = statistics.mean(vals)
    se = statistics.stdev(vals) / math.sqrt(n)
    # t-critical approx for large n (use 1.96); for small n use t-table approximation
    t = 1.96 if n >= 30 else {1:12.7,2:4.30,3:3.18,4:2.78,5:2.57,6:2.45,7:2.36,
        8:2.31,9:2.26,10:2.23,15:2.13,20:2.09,25:2.06}.get(n, 2.0)
    return round(m - t*se, 3), round(m + t*se, 3)


# ── Public: start session ─────────────────────────────────────────────────

@router.post("/api/survey/{slug}/start", response_model=StartSessionOut)
def start_session(slug: str, db: Session = Depends(get_db)):
    s = db.query(Survey).filter(Survey.public_slug == slug).first()
    if not s:
        raise HTTPException(404, "Survey not found.")
    if s.status != "published":
        raise HTTPException(403, "This survey is not currently accepting responses.")

    n_per = min(s.settings.get("n_per_evaluator", 3), s.pattern_count)
    assigned = random.sample(s.patterns, n_per)

    link_cols = {k for p in assigned for k in p if k.endswith('_link')}
    keep = set(s.display_columns) | {"_id","title","year","pdf_link","ODPs links","Type","type"} | link_cols
    slim = [{k: p[k] for k in keep if k in p} for p in assigned]

    # Attach per-pattern question set
    pmap   = s.pattern_question_map   # {"2023-133-01": "author", ...}
    qsets  = s.question_sets          # {"default": [...], "author": [...]}

    def _resolve_set(key: str) -> str:
        """Exact match first, then prefix match (handles trailing -XX variants)."""
        if key in pmap:
            return pmap[key]
        for mk, mv in pmap.items():
            if key.startswith(mk + '-') or mk.startswith(key + '-'):
                return mv
        return "default"

    for pat_slim, pat_full in zip(slim, assigned):
        sid_val  = next((str(pat_full[k]) for k in ("scenario_id","Scenario_id","ScenarioID") if pat_full.get(k)), str(pat_full.get("_id","")))
        set_name = _resolve_set(sid_val)
        pat_slim["_questions"] = qsets.get(set_name) or s.questions

    import secrets
    from sqlalchemy import func
    max_num = db.query(func.max(EvalSession.num)).filter(EvalSession.survey_id == s.id).scalar() or 0
    session  = EvalSession(survey_id=s.id, token=secrets.token_urlsafe(32), num=max_num+1)
    session.patterns_assigned = slim
    db.add(session); db.commit(); db.refresh(session)

    return StartSessionOut(
        session_token=session.token, session_num=session.num,
        survey_title=s.title, survey_description=s.description,
        n_patterns=n_per, patterns=slim, questions=s.questions,
    )


# ── Public: submit ────────────────────────────────────────────────────────

@router.post("/api/responses", status_code=201)
def submit_responses(body: SubmitResponses, db: Session = Depends(get_db)):
    session = db.query(EvalSession).filter(EvalSession.token == body.session_token).first()
    if not session:
        raise HTTPException(404, "Session not found.")
    survey = db.get(Survey, session.survey_id)
    if not survey or survey.status != "published":
        raise HTTPException(403, "Survey is no longer accepting responses.")
    if session.is_completed:
        raise HTTPException(409, "Already submitted.")

    for pr in body.responses:
        r = Response(
            survey_id=session.survey_id, session_id=session.id,
            pattern_id=pr.pattern_id, pattern_title=pr.pattern_title,
            pattern_link=pr.pattern_link,
            started_at=pr.started_at, completed_at=pr.completed_at,
            duration_ms=pr.duration_ms, session_duration_ms=body.session_duration_ms,
        )
        r.answers = pr.answers
        db.add(r)

    session.submitted_at = datetime.utcnow()
    db.commit()
    return {"status": "ok", "saved": len(body.responses)}


# ── Admin: delete session ─────────────────────────────────────────────────

@router.delete("/api/surveys/{sid}/sessions/{snum}", status_code=204)
def delete_session(sid: int, snum: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    session = db.query(EvalSession).filter(
        EvalSession.survey_id == sid, EvalSession.num == snum
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.delete(session)   # cascade deletes its responses
    db.commit()


# ── Admin: clear all responses ────────────────────────────────────────────

@router.delete("/api/surveys/{sid}/responses", status_code=204)
def clear_responses(sid: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    survey = db.get(Survey, sid)
    if not survey:
        raise HTTPException(404, "Survey not found")
    db.query(Response).filter(Response.survey_id == sid).delete()
    db.query(EvalSession).filter(EvalSession.survey_id == sid).delete()
    db.commit()


# ── Admin: sessions ───────────────────────────────────────────────────────

@router.get("/api/surveys/{sid}/sessions")
def list_sessions(sid: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    sessions = db.query(EvalSession).filter(EvalSession.survey_id==sid)\
                  .order_by(EvalSession.opened_at.desc()).all()
    return [
        {"num": s.num, "opened_at": s.opened_at.isoformat() if s.opened_at else None,
         "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
         "is_completed": s.is_completed, "n_patterns": len(s.patterns_assigned),
         "n_responses": s.response_count}
        for s in sessions
    ]


# ── Admin: responses ──────────────────────────────────────────────────────

@router.get("/api/surveys/{sid}/responses", response_model=list[ResponseOut])
def list_responses(sid: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    rows = db.query(Response).filter(Response.survey_id==sid)\
              .order_by(Response.submitted_at.desc()).all()
    return [ResponseOut(
        id=r.id, session_num=r.session.num if r.session else None,
        pattern_id=r.pattern_id, pattern_title=r.pattern_title,
        pattern_link=r.pattern_link or "",
        answers=r.answers, started_at=r.started_at, completed_at=r.completed_at,
        duration_ms=r.duration_ms, submitted_at=r.submitted_at,
    ) for r in rows]


# ── Admin: statistics (rich) ──────────────────────────────────────────────

@router.get("/api/surveys/{sid}/stats")
def get_stats(sid: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    survey    = db.get(Survey, sid)
    if not survey: raise HTTPException(404)
    sessions  = db.query(EvalSession).filter(EvalSession.survey_id==sid).all()
    responses = db.query(Response).filter(Response.survey_id==sid).all()

    n_completed  = sum(1 for s in sessions if s.is_completed)
    session_ms   = [r.session_duration_ms for r in responses if r.session_duration_ms]
    avg_session  = statistics.mean(session_ms) if session_ms else None

    questions = survey.questions
    q_stats   = []

    for q in questions:
        qid   = q["id"]
        qtype = q.get("type","text")
        scale = q.get("scale", 5)
        raw   = [r.answers.get(qid) for r in responses if r.answers.get(qid) not in (None,"")]
        n     = len(raw)

        if qtype == "likert":
            vals = []
            for v in raw:
                try: vals.append(float(v))
                except: pass

            mean   = round(statistics.mean(vals),4)  if vals else None
            std    = round(statistics.stdev(vals),4) if len(vals)>1 else None
            med    = median_val(vals)
            iqr    = iqr_val(vals)
            ci_lo, ci_hi = ci95(vals)
            dist   = {str(i):0 for i in range(1,scale+1)}
            for v in vals:
                k=str(int(v));
                if k in dist: dist[k]+=1

            # Build rater × unit matrix for agreement (units = patterns)
            by_unit: dict[int, list] = defaultdict(list)
            for r in responses:
                v = r.answers.get(qid)
                try: by_unit[r.pattern_id].append(float(v))
                except: by_unit[r.pattern_id].append(None)

            units_data = [vals_list for vals_list in by_unit.values() if any(v is not None for v in vals_list)]

            alpha  = krippendorffs_alpha(units_data, "ordinal") if len(units_data)>=2 else None
            kappa  = fleiss_kappa(
                [[int(v) if v is not None else None for v in u] for u in units_data],
                scale
            ) if len(units_data)>=2 else None
        else:
            vals=raw; mean=std=med=iqr=ci_lo=ci_hi=alpha=kappa=dist=None

        q_stats.append({
            "question_id":    qid,
            "question_label": q.get("label", qid),
            "question_type":  qtype,
            "scale":          scale if qtype=="likert" else None,
            "labels":         q.get("labels"),
            "n":              n,
            "mean":           mean,
            "std":            std,
            "median":         med,
            "iqr":            iqr,
            "ci_95_low":      ci_lo,
            "ci_95_high":     ci_hi,
            "distribution":   dist,
            "krippendorff_alpha":       alpha,
            "krippendorff_alpha_interp": interpret_alpha(alpha),
            "fleiss_kappa":             kappa,
            "fleiss_kappa_interp":      interpret_kappa(kappa),
        })

    # Per-pattern stats
    by_pattern: dict[int, list[Response]] = defaultdict(list)
    for r in responses: by_pattern[r.pattern_id].append(r)

    p_stats = []
    for pid, presps in sorted(by_pattern.items()):
        title = presps[0].pattern_title if presps else str(pid)
        means = {}
        for q in questions:
            if q.get("type")=="likert":
                qid = q["id"]
                vs  = []
                for r in presps:
                    try: vs.append(float(r.answers[qid]))
                    except: pass
                means[qid] = round(statistics.mean(vs),3) if vs else None
        p_stats.append({
            "pattern_id":    pid,
            "pattern_title": title,
            "n_responses":   len(presps),
            "means":         means,
            "overall_mean":  round(statistics.mean([v for v in means.values() if v is not None]),3)
                             if any(v is not None for v in means.values()) else None,
        })

    # Sort patterns by overall mean desc
    p_stats.sort(key=lambda p: p["overall_mean"] or 0, reverse=True)

    # Evaluator agreement summary
    likert_qs = [q for q in questions if q.get("type")=="likert"]
    overall_alpha = None
    if likert_qs:
        all_unit_data = []
        q0 = likert_qs[0]["id"]
        by_unit: dict[int, list] = defaultdict(list)
        for r in responses:
            v = r.answers.get(q0)
            try: by_unit[r.pattern_id].append(float(v))
            except: by_unit[r.pattern_id].append(None)
        units_data = [vl for vl in by_unit.values() if sum(1 for v in vl if v is not None)>=2]
        overall_alpha = krippendorffs_alpha(units_data,"ordinal") if units_data else None

    return {
        "survey_id":         sid,
        "survey_title":      survey.title,
        "n_sessions":        len(sessions),
        "n_completed":       n_completed,
        "n_responses":       len(responses),
        "n_patterns_covered":len(by_pattern),
        "avg_session_ms":    avg_session,
        "overall_krippendorff_alpha":       overall_alpha,
        "overall_krippendorff_alpha_interp": interpret_alpha(overall_alpha),
        "question_stats":    q_stats,
        "pattern_stats":     p_stats,
    }
