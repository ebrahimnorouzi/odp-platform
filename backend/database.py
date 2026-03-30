"""
ODP Evaluation Platform — Database Layer
Survey lifecycle: draft → published → paused
"""
import json, os, secrets
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text,
    DateTime, Boolean, ForeignKey, event, text
)
from sqlalchemy.orm import DeclarativeBase, relationship, Session
from sqlalchemy.pool import StaticPool

DB_PATH = os.getenv("DB_PATH", "/data/odp_eval.db")
engine  = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
    dbapi_conn.execute("PRAGMA busy_timeout=5000")

class Base(DeclarativeBase):
    pass

def _j(v):  return json.dumps(v)
def _l(v):  return json.loads(v or "[]")
def _ld(v): return json.loads(v or "{}")


class Survey(Base):
    __tablename__ = "surveys"

    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String(256), nullable=False)
    description  = Column(Text, default="")
    csv_filename = Column(String(256), default="")
    status       = Column(String(16), default="draft")   # draft | published | paused
    public_slug  = Column(String(64), unique=True, nullable=True, index=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    _patterns        = Column("patterns",        Text, default="[]")
    _questions       = Column("questions",        Text, default="[]")
    _display_columns = Column("display_columns",  Text, default="[]")
    _settings        = Column("settings",         Text, default="{}")

    sessions  = relationship("EvalSession",  back_populates="survey", cascade="all, delete-orphan")
    responses = relationship("Response",     back_populates="survey", cascade="all, delete-orphan")

    @property
    def patterns(self):        return _l(self._patterns)
    @patterns.setter
    def patterns(self, v):     self._patterns = _j(v)

    @property
    def questions(self):       return _l(self._questions)
    @questions.setter
    def questions(self, v):    self._questions = _j(v)

    @property
    def display_columns(self): return _l(self._display_columns)
    @display_columns.setter
    def display_columns(self, v): self._display_columns = _j(v)

    @property
    def settings(self):        return _ld(self._settings)
    @settings.setter
    def settings(self, v):     self._settings = _j(v)

    @property
    def is_published(self):    return self.status == "published"
    @property
    def pattern_count(self):   return len(self.patterns)
    @property
    def session_count(self):   return len(self.sessions)
    @property
    def response_count(self):  return len(self.responses)
    @property
    def completed_count(self): return sum(1 for s in self.sessions if s.is_completed)


class EvalSession(Base):
    """Created automatically when an evaluator opens the public survey link."""
    __tablename__ = "eval_sessions"

    id           = Column(Integer, primary_key=True, index=True)
    survey_id    = Column(Integer, ForeignKey("surveys.id"), nullable=False)
    token        = Column(String(64), unique=True, nullable=False, index=True)
    num          = Column(Integer, nullable=False)   # auto-increment per survey
    opened_at    = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    _patterns_assigned = Column("patterns_assigned", Text, default="[]")

    survey    = relationship("Survey", back_populates="sessions")
    responses = relationship("Response", back_populates="session", cascade="all, delete-orphan")

    @property
    def patterns_assigned(self):     return _l(self._patterns_assigned)
    @patterns_assigned.setter
    def patterns_assigned(self, v):  self._patterns_assigned = _j(v)

    @property
    def is_completed(self):  return self.submitted_at is not None
    @property
    def response_count(self): return len(self.responses)


class Response(Base):
    __tablename__ = "responses"

    id              = Column(Integer, primary_key=True, index=True)
    survey_id       = Column(Integer, ForeignKey("surveys.id"), nullable=False)
    session_id      = Column(Integer, ForeignKey("eval_sessions.id"), nullable=False)
    pattern_id      = Column(Integer, nullable=False)
    pattern_title   = Column(String(512), default="")
    pattern_link    = Column(String(512), default="")
    _answers        = Column("answers", Text, default="{}")
    started_at      = Column(DateTime, nullable=True)
    completed_at    = Column(DateTime, nullable=True)
    duration_ms     = Column(Integer, nullable=True)
    session_duration_ms = Column(Integer, nullable=True)
    submitted_at    = Column(DateTime, default=datetime.utcnow)

    survey  = relationship("Survey",      back_populates="responses")
    session = relationship("EvalSession", back_populates="responses")

    @property
    def answers(self):    return _ld(self._answers)
    @answers.setter
    def answers(self, v): self._answers = _j(v)


def get_db():
    db = Session(engine)
    try:    yield db
    finally: db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # Migrate: add columns introduced after initial schema
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE responses ADD COLUMN pattern_link VARCHAR(512) DEFAULT ''",
        ]:
            try:
                conn.execute(text(stmt)); conn.commit()
            except Exception:
                pass  # column already exists


def make_slug():
    return secrets.token_urlsafe(10)   # e.g. "kB3xR9mQpL2w"
