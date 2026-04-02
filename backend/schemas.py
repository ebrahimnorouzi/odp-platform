"""Pydantic v2 schemas — ODP Evaluation Platform."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Question definition ────────────────────────────────────────────────────
class Question(BaseModel):
    id:          str
    type:        str   # likert | text | textarea | boolean | select
    label:       str
    help:        str  = ""
    required:    bool = False
    scale:       Optional[int]        = 5
    labels:      Optional[list[str]]  = None  # [low_label, high_label]
    options:     Optional[list[str]]  = None  # for select
    placeholder: Optional[str]        = None


# ── Survey ─────────────────────────────────────────────────────────────────
class SurveyCreate(BaseModel):
    title:                str
    description:          str  = ""
    n_per_evaluator:      int  = Field(3, ge=1, le=200)
    time_limit_minutes:   int  = Field(0, ge=0)   # 0 = no limit

class SurveyUpdate(BaseModel):
    title:                Optional[str]            = None
    description:          Optional[str]            = None
    display_columns:      Optional[list[str]]      = None
    questions:            Optional[list[Question]] = None
    n_per_evaluator:      Optional[int]            = None
    time_limit_minutes:   Optional[int]            = None
    question_sets:        Optional[dict]           = None
    pattern_question_map: Optional[dict]           = None

class SurveyOut(BaseModel):
    id:              int
    title:           str
    description:     str
    csv_filename:    str
    status:          str   # draft | published | paused
    public_slug:     Optional[str]
    public_url:      Optional[str]  = None   # injected by endpoint
    created_at:      datetime
    updated_at:      datetime
    published_at:    Optional[datetime]
    pattern_count:   int
    session_count:   int
    response_count:  int
    completed_count: int
    display_columns:      list[str]
    questions:            list[dict]
    settings:             dict[str, Any]
    question_sets:        dict         = {}
    pattern_question_map: dict         = {}
    model_config = {"from_attributes": True}

class SurveyDetail(SurveyOut):
    patterns: list[dict]


# ── Public survey session ──────────────────────────────────────────────────
class StartSessionOut(BaseModel):
    """Returned when evaluator opens a published survey link."""
    session_token:       str
    session_num:         int
    survey_title:        str
    survey_description:  str
    n_patterns:          int
    patterns:            list[dict]
    questions:           list[dict]
    time_limit_minutes:  Optional[int] = None  # None / 0 = no limit


# ── Response submission ────────────────────────────────────────────────────
class PatternResponse(BaseModel):
    pattern_id:    int
    pattern_title: str
    pattern_link:  str = ""
    answers:       dict[str, Any]
    started_at:    Optional[datetime] = None
    completed_at:  Optional[datetime] = None
    duration_ms:   Optional[int]      = None

class SubmitResponses(BaseModel):
    session_token:       str
    responses:           list[PatternResponse]
    session_duration_ms: Optional[int] = None


# ── Admin view of responses ────────────────────────────────────────────────
class ResponseOut(BaseModel):
    id:            int
    session_num:   Optional[int]
    pattern_id:    int
    pattern_title: str
    pattern_link:  str = ""
    answers:       dict[str, Any]
    started_at:    Optional[datetime]
    completed_at:  Optional[datetime]
    duration_ms:   Optional[int]
    submitted_at:  datetime
    model_config = {"from_attributes": True}


# ── Statistics ─────────────────────────────────────────────────────────────
class QuestionStat(BaseModel):
    question_id:    str
    question_label: str
    question_type:  str
    n:              int
    mean:           Optional[float]
    std:            Optional[float]
    distribution:   Optional[dict[str, int]]

class PatternStat(BaseModel):
    pattern_id:    int
    pattern_title: str
    n_responses:   int
    means:         dict[str, Optional[float]]

class SurveyStats(BaseModel):
    survey_id:           int
    survey_title:        str
    n_sessions:          int
    n_completed:         int
    n_responses:         int
    n_patterns_covered:  int
    avg_session_ms:      Optional[float]
    question_stats:      list[QuestionStat]
    pattern_stats:       list[PatternStat]


# ── Auth ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
