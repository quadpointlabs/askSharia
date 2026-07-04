import logging
import sys
from sqlalchemy import create_engine, Column, String, DateTime, Boolean, Integer, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = "sqlite:///./rag_users.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    mobile = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    tokens = Column(Integer, default=100, nullable=False)
    plan = Column(String, default="free", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Owner(Base):
    __tablename__ = "owners"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Admin(Base):
    __tablename__ = "admins"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True)
    actor_id = Column(String, nullable=False)
    actor_type = Column(String, nullable=False, default="user")
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    sources = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FileStatus(Base):
    """Explicit indexing state for an uploaded file.

    Status is tracked here rather than inferred from Qdrant so that a file whose
    indexing failed or was interrupted shows a definite state (and can be retried)
    instead of being stuck at "indexing…" forever.

    owner_id is the indexing namespace — a real user id, or SHARED_OWNER_ID for
    owner/shared uploads.
    """
    __tablename__ = "file_status"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, nullable=False, index=True)
    file_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | indexed | failed
    error = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("owner_id", "file_name", name="uix_file_status_owner_name"),
    )


try:
    Base.metadata.create_all(bind=engine)
except Exception:
    logger.exception("Failed to initialize database schema — cannot start")
    sys.exit(1)

def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
