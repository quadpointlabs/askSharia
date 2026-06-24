'''
RAG Chatbot API — FastAPI entry point.
'''

from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import List, Optional
import json
import logging
import os
import re
import secrets
import shutil
import smtplib

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

from database import get_db, User, Admin, Owner, ChatSession, ChatMessage, SessionLocal, engine
from auth import hash_password, verify_password, create_access_token, get_current_user, get_current_owner, get_current_admin
from indexer import delete_user_files, index_user_files, get_indexed_filenames, SUPPORTED_EXTENSIONS

from llama_index.core import VectorStoreIndex
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.postprocessor.types import BaseNodePostprocessor
from llama_index.core.schema import NodeWithScore, QueryBundle
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.anthropic import Anthropic
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.core.chat_engine.condense_plus_context import CondensePlusContextChatEngine
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from qdrant_client import QdrantClient, AsyncQdrantClient

load_dotenv()

# ── Email / verification ──────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)

# email -> {code, expires_at}
_verification_codes: dict = {}

def _send_email(to: str, subject: str, body: str) -> None:
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — skipping email to %s. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.", to)
        return
    msg = MIMEMultipart()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to, msg.as_string())
    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP authentication failed — check SMTP_USER and SMTP_PASSWORD in .env")
        raise HTTPException(status_code=503, detail="Email service authentication failed — please contact support")
    except smtplib.SMTPException as exc:
        logger.error("SMTP error sending to %s: %s", to, exc)
        raise HTTPException(status_code=503, detail="Failed to send email — please try again later")

# ── Setup ────────────────────────────────────────────────────
COLLECTION_NAME = "rag_documents"
UPLOAD_DIR = Path("text_files")
SYSTEM_PROMPT_FILE = Path("system_prompt.txt")
SHARED_OWNER_ID = "shared"  # all owners share one file pool

try:
    client = QdrantClient(url=os.getenv("QDRANT_URL", "localhost"), port=6333)
    aclient = AsyncQdrantClient(url=os.getenv("QDRANT_URL", "localhost"), port=6333)
    embed_model = HuggingFaceEmbedding(model_name="intfloat/multilingual-e5-large")
    llm = Anthropic(model="claude-sonnet-4-5", api_key=os.environ["ANTHROPIC_API_KEY"])
    vector_store = QdrantVectorStore(client=client, aclient=aclient, collection_name=COLLECTION_NAME)
    index = VectorStoreIndex.from_vector_store(vector_store=vector_store, embed_model=embed_model)
except KeyError as e:
    logger.critical("Missing required environment variable: %s", e)
    raise SystemExit(1)
except Exception:
    logger.exception("Failed to initialize server components — check Qdrant connection and API keys")
    raise SystemExit(1)

# ── Citation postprocessor ───────────────────────────────────
class NumberedSourcePostprocessor(BaseNodePostprocessor):
    def _postprocess_nodes(
        self,
        nodes: List[NodeWithScore],
        query_bundle: Optional[QueryBundle] = None,
    ) -> List[NodeWithScore]:
        file_to_ref = {}
        ref_num = 1
        for node in nodes:
            filename = node.node.metadata.get("file_name", "unknown")
            if filename not in file_to_ref:
                file_to_ref[filename] = ref_num
                ref_num += 1
            num = file_to_ref[filename]
            node.node.metadata["source_number"] = num
            node.node.set_content(
                f"[{num}] (from: {filename})\n{node.node.get_content()}"
            )
        return nodes

# ── Session storage (per user chat history) ──────────────────
sessions = {}

app = FastAPI(title="RAG Chatbot API")


@app.on_event("startup")
def startup():
    # Add enabled column to users if it doesn't exist (one-time migration)
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT 1"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN tokens INTEGER NOT NULL DEFAULT 100"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN plan VARCHAR NOT NULL DEFAULT 'free'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN mobile VARCHAR"))
            conn.commit()
        except Exception:
            pass

    # Load persisted system prompt if present
    global _system_prompt
    if SYSTEM_PROMPT_FILE.exists():
        try:
            _system_prompt = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8")
        except Exception:
            pass

    # Seed default admin account
    db = SessionLocal()
    try:
        if not db.query(Admin).first():
            db.add(Admin(username="admin", hashed_password=hash_password("admin1234")))
            db.commit()
            logger.info("Default admin account created (username: admin)")
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred"})

# ── Schemas ──────────────────────────────────────────────────
class SendVerificationRequest(BaseModel):
    email: EmailStr

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    mobile: Optional[str] = None
    verification_code: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ChatRequest(BaseModel):
    question: str
    chat_id: Optional[str] = None

class CreateChatRequest(BaseModel):
    name: str

class RenameChatRequest(BaseModel):
    name: str

class AdminLoginRequest(BaseModel):
    username: str
    password: str

class AdminChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class UserStatusRequest(BaseModel):
    enabled: bool

class OwnerCreateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

# ── Auth Endpoints ───────────────────────────────────────────
@app.post("/auth/send-verification")
def send_verification(req: SendVerificationRequest, db: Session = Depends(get_db)):
    email = req.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    code = str(secrets.randbelow(1000000)).zfill(6)
    _verification_codes[email] = {"code": code, "expires_at": datetime.utcnow() + timedelta(minutes=10)}
    _send_email(
        to=email,
        subject="askSharia — Email Verification Code",
        body=(
            f"Your verification code is: {code}\n\n"
            "This code expires in 10 minutes.\n\n"
            "If you did not request this, please ignore this email."
        ),
    )
    logger.info("Verification code sent to %s", email)
    return {"message": "Verification code sent"}


@app.post("/auth/register", status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.lower()
    pending = _verification_codes.get(email)
    if not pending:
        raise HTTPException(status_code=400, detail="Please request a verification code first")
    if datetime.utcnow() > pending["expires_at"]:
        _verification_codes.pop(email, None)
        raise HTTPException(status_code=400, detail="Verification code has expired — please request a new one")
    if pending["code"] != req.verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    _verification_codes.pop(email, None)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if req.mobile and db.query(User).filter(User.mobile == req.mobile).first():
        raise HTTPException(status_code=409, detail="An account with this mobile number already exists")
    user = User(name=req.name, email=email, hashed_password=hash_password(req.password), mobile=req.mobile)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "mobile": user.mobile}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.enabled:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return {"access_token": create_access_token({"sub": user.id}), "token_type": "bearer"}


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "tokens": getattr(current_user, "tokens", 100),
        "plan": getattr(current_user, "plan", "free"),
        "created_at": current_user.created_at,
    }

# ── Owner Auth ───────────────────────────────────────────────
@app.post("/owner/auth/login")
def owner_login(req: LoginRequest, db: Session = Depends(get_db)):
    owner = db.query(Owner).filter(Owner.email == req.email.lower()).first()
    if not owner or not verify_password(req.password, owner.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not owner.enabled:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return {"access_token": create_access_token({"sub": owner.id}), "token_type": "bearer"}


@app.get("/owner/auth/me")
def owner_get_me(current_owner: Owner = Depends(get_current_owner)):
    return {
        "id": current_owner.id,
        "name": current_owner.name,
        "email": current_owner.email,
        "created_at": current_owner.created_at,
    }


# ── Chat ─────────────────────────────────────────────────────
_DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer ONLY using the provided documents. "
    "Each retrieved passage is labeled with its source file. "
    "If multiple passages come from the same file, use the same citation number for that file. "
    "Cite inline immediately after each statement using [1], [2] format, where the number corresponds to the source file. "
    "If the answer is not in the documents, say: "
    "English: 'This information is not available in the provided documents.' "
    "Arabic: 'هذه المعلومات غير متوفرة في الوثائق المتاحة.' "
    "Hebrew: 'מידע זה אינו זמין במסמכים שסופקו.' "
    "Always respond in the same language the user used."
)
_system_prompt: str = _DEFAULT_SYSTEM_PROMPT


def get_chat_engine(cache_key: str, user_ids: list):
    """
    user_ids: list of user/owner IDs whose documents to include.
    For an owner chatting, pass [owner_id].
    For a regular user, pass all enabled owner IDs so they query the shared knowledge base.
    """
    if cache_key not in sessions:
        if len(user_ids) == 1:
            filters = Filter(
                must=[FieldCondition(key="user_id", match=MatchValue(value=user_ids[0]))]
            )
        else:
            filters = Filter(
                should=[FieldCondition(key="user_id", match=MatchValue(value=uid)) for uid in user_ids]
            )
        retriever = index.as_retriever(
            similarity_top_k=3,
            vector_store_kwargs={"qdrant_filters": filters},
        )
        sessions[cache_key] = CondensePlusContextChatEngine.from_defaults(
            retriever=retriever,
            memory=ChatMemoryBuffer.from_defaults(token_limit=4096),
            llm=llm,
            node_postprocessors=[NumberedSourcePostprocessor()],
            system_prompt=_system_prompt,
            verbose=False,
        )
    return sessions[cache_key]


# Token pricing knobs for question complexity
_TOKEN_WORDS_PER_UNIT = 25   # +1 token for each block of this many words
_TOKEN_MAX_COST = 10         # cap so a single question can never drain everything


def compute_question_cost(question: str) -> int:
    """How many tokens a question costs. Always at least 1; longer or multi-part
    (more complex) questions cost more, capped at _TOKEN_MAX_COST.

    Complexity is derived from what the question contains:
      - length in words (longer questions cost more)
      - number of distinct questions asked (each extra '?' / '؟' adds one)
    """
    text = (question or "").strip()
    if not text:
        return 1

    word_count = len(re.findall(r"\S+", text))
    cost = 1 + word_count // _TOKEN_WORDS_PER_UNIT

    # Multi-part questions cost one extra token per additional question mark
    # (supports the Arabic question mark '؟' as well as '?').
    question_marks = text.count("?") + text.count("؟")
    if question_marks > 1:
        cost += question_marks - 1

    return max(1, min(cost, _TOKEN_MAX_COST))


@app.post("/chat")
def chat(req: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    is_owner = isinstance(current_user, Owner)

    if not is_owner:
        if current_user.tokens <= 0:
            raise HTTPException(status_code=402, detail="No tokens remaining. Contact your owner to top up.")

    try:
        session_key = req.chat_id if req.chat_id else str(current_user.id)
        # All actors (owners and users) query the shared file pool plus any legacy per-owner files
        owner_ids = [str(o.id) for o in db.query(Owner).filter(Owner.enabled == True).all()]
        if SHARED_OWNER_ID not in owner_ids:
            owner_ids.append(SHARED_OWNER_ID)
        engine = get_chat_engine(session_key, owner_ids or [SHARED_OWNER_ID])
        response = engine.chat(req.question)

        # Step 1: Build file → correct reference number mapping
        # Use the LOWEST source_number for each unique file
        file_to_info = {}
        for node in response.source_nodes:
            filename = node.metadata.get("file_name", "unknown")
            number = node.metadata.get("source_number", 1)
            if filename not in file_to_info:
                file_to_info[filename] = {
                    "number": number,
                    "file": filename,
                    "score": round(node.score, 3) if node.score else None,
                }
            else:
                # Keep lowest number for this file
                if number < file_to_info[filename]["number"]:
                    file_to_info[filename]["number"] = number

        # Step 2: Build reverse map — wrong_number → correct_number
        # So [2] and [3] from same file get replaced with [1]
        wrong_to_correct = {}
        for node in response.source_nodes:
            filename = node.metadata.get("file_name", "unknown")
            wrong_num = node.metadata.get("source_number")
            correct_num = file_to_info[filename]["number"]
            if wrong_num and wrong_num != correct_num:
                wrong_to_correct[wrong_num] = correct_num

        # Step 3: Fix inline citations in answer text
        answer = str(response)
        for wrong_num, correct_num in wrong_to_correct.items():
            answer = answer.replace(f"[{wrong_num}]", f"[{correct_num}]")

        # Step 4: Remove any trailing 📎 line
        if "📎" in answer:
            answer = answer[:answer.rfind("📎")].strip()

        # Step 5: Build deduplicated sources list
        sources = list(file_to_info.values())

        # Deduct tokens for regular users after a successful response.
        # Cost scales with question complexity (min 1).
        tokens_remaining = None
        tokens_charged = None
        if not is_owner:
            tokens_charged = compute_question_cost(req.question)
            current_user.tokens = max(0, current_user.tokens - tokens_charged)
            db.add(current_user)
            db.commit()
            tokens_remaining = current_user.tokens

        # Persist messages when a named chat session is active
        if req.chat_id:
            try:
                db.add(ChatMessage(session_id=req.chat_id, role="user", content=req.question))
                db.add(ChatMessage(
                    session_id=req.chat_id,
                    role="bot",
                    content=answer,
                    sources=json.dumps(sources) if sources else None,
                ))
                db.commit()
            except Exception:
                logger.warning("Failed to persist messages for chat_id %s", req.chat_id)

        return {
            "answer": answer,
            "sources": sources,
            "tokens_remaining": tokens_remaining,
            "tokens_charged": tokens_charged,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Chat error for user %s", current_user.id)
        raise HTTPException(status_code=500, detail="Chat service error. Please try again.")


# ── File Upload ───────────────────────────────────────────────
def _index_file_background(index_id: str, file_dir: str, dest: Path, clear_all_sessions: bool):
    """Index an uploaded file and refresh chat caches. Runs after the response is sent.

    On failure the offending file is removed so a later upload can retry cleanly.
    """
    try:
        index_user_files(user_id=index_id, file_dir=file_dir)
        if clear_all_sessions:
            sessions.clear()
        else:
            sessions.pop(index_id, None)
        logger.info("Background indexing complete for %s, file %s", index_id, dest.name)
    except Exception:
        logger.exception("Background indexing failed for %s, file %s", index_id, dest.name)
        if dest.exists():
            dest.unlink(missing_ok=True)


def _save_upload(file: UploadFile, target_dir: Path) -> Path:
    """Validate extension and stream the upload to disk. Returns the saved path."""
    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(SUPPORTED_EXTENSIONS)}",
        )
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / safe_name
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception:
        logger.exception("Failed to save upload %s", safe_name)
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save the file.")
    return dest


@app.post("/upload", status_code=202)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    user_dir = UPLOAD_DIR / current_user.id
    dest = _save_upload(file, user_dir)
    background_tasks.add_task(
        _index_file_background, current_user.id, str(user_dir), dest, False
    )
    return {
        "message": f"File '{dest.name}' uploaded — indexing in the background",
        "file": dest.name,
        "status": "indexing",
    }


# ── List User Files ───────────────────────────────────────────
@app.get("/files")
def list_files(current_user: User = Depends(get_current_user)):
    user_dir = UPLOAD_DIR / current_user.id
    if not user_dir.exists():
        return {"files": []}
    indexed_names = get_indexed_filenames(current_user.id)
    files = [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "uploaded_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            "indexed": f.name in indexed_names,
        }
        for f in user_dir.iterdir() if f.is_file()
    ]
    return {"files": files}


# ── Download a File ──────────────────────────────────────────
@app.get("/files/{filename}/download")
def download_file(filename: str, current_user: User = Depends(get_current_user)):
    if filename != Path(filename).name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = UPLOAD_DIR / current_user.id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")


# ── Delete a File ─────────────────────────────────────────────
@app.delete("/files/{filename}")
def delete_file(filename: str, current_user: User = Depends(get_current_user)):
    # Reject any path traversal attempts
    if filename != Path(filename).name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    user_dir = UPLOAD_DIR / current_user.id
    file_path = user_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    file_path.unlink()
    sessions.pop(current_user.id, None)
    try:
        delete_user_files(current_user.id)
        remaining = [f for f in user_dir.iterdir() if f.is_file()]
        if remaining:
            index_user_files(user_id=current_user.id, file_dir=str(user_dir))
    except Exception:
        logger.exception("Index update failed after deleting %s for user %s", filename, current_user.id)
        raise HTTPException(status_code=500, detail="File deleted but index update failed. Search results may be stale.")
    return {"message": f"File '{filename}' deleted successfully"}


# ── Owner File Management ────────────────────────────────────
@app.post("/owner/upload", status_code=202)
async def owner_upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_owner: Owner = Depends(get_current_owner),
):
    shared_dir = UPLOAD_DIR / SHARED_OWNER_ID
    dest = _save_upload(file, shared_dir)
    background_tasks.add_task(
        _index_file_background, SHARED_OWNER_ID, str(shared_dir), dest, True
    )
    return {
        "message": f"File '{dest.name}' uploaded — indexing in the background",
        "file": dest.name,
        "status": "indexing",
    }


@app.get("/owner/files")
def owner_list_files(current_owner: Owner = Depends(get_current_owner)):
    shared_dir = UPLOAD_DIR / SHARED_OWNER_ID
    if not shared_dir.exists():
        return {"files": []}
    indexed_names = get_indexed_filenames(SHARED_OWNER_ID)
    files = [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "uploaded_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            "indexed": f.name in indexed_names,
        }
        for f in shared_dir.iterdir() if f.is_file()
    ]
    return {"files": files}


@app.get("/owner/files/{filename}/download")
def owner_download_file(filename: str, current_owner: Owner = Depends(get_current_owner)):
    if filename != Path(filename).name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = UPLOAD_DIR / SHARED_OWNER_ID / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")


@app.delete("/owner/files/{filename}")
def owner_delete_file(filename: str, current_owner: Owner = Depends(get_current_owner)):
    if filename != Path(filename).name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    shared_dir = UPLOAD_DIR / SHARED_OWNER_ID
    file_path = shared_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    file_path.unlink()
    sessions.clear()
    try:
        delete_user_files(SHARED_OWNER_ID)
        remaining = [f for f in shared_dir.iterdir() if f.is_file()]
        if remaining:
            index_user_files(user_id=SHARED_OWNER_ID, file_dir=str(shared_dir))
    except Exception:
        logger.exception("Index update failed after deleting %s for owner %s", filename, current_owner.id)
        raise HTTPException(status_code=500, detail="File deleted but index update failed.")
    return {"message": f"File '{filename}' deleted successfully"}


# ── Admin Auth ───────────────────────────────────────────────
@app.post("/admin/auth/login")
def admin_login(req: AdminLoginRequest, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == req.username).first()
    if not admin or not verify_password(req.password, admin.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_access_token({"admin_sub": admin.id}), "token_type": "bearer"}


@app.post("/admin/auth/change-password")
def admin_change_password(
    req: AdminChangePasswordRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_admin.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_admin.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


# ── Admin Dashboard ──────────────────────────────────────────
@app.get("/admin/stats")
def admin_stats(current_admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_files = (
        sum(len(list(d.iterdir())) for d in UPLOAD_DIR.iterdir() if d.is_dir())
        if UPLOAD_DIR.exists() else 0
    )
    return {
        "total_users": total_users,
        "total_files": total_files,
        "total_chats": len(sessions),
        "active_today": len(sessions),
    }


@app.get("/admin/users")
def admin_list_users(current_admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "enabled": u.enabled,
            "created_at": u.created_at,
            "role": "user",
        }
        for u in users
    ]


@app.post("/admin/users")
def admin_create_user(
    req: RegisterRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    email = req.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=req.name, email=email, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email}


@app.put("/admin/users/{user_id}/status")
def admin_set_user_status(
    user_id: str,
    req: UserStatusRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.enabled = req.enabled
    db.commit()
    return {"message": "Status updated"}


# ── Admin → Owner Management ─────────────────────────────────
@app.get("/admin/owners")
def admin_list_owners(current_admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    owners = db.query(Owner).order_by(Owner.created_at.desc()).all()
    return [
        {
            "id": o.id,
            "name": o.name,
            "email": o.email,
            "enabled": o.enabled,
            "created_at": o.created_at,
        }
        for o in owners
    ]


@app.post("/admin/owners")
def admin_create_owner(
    req: OwnerCreateRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    email = req.email.lower()
    if db.query(Owner).filter(Owner.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    owner = Owner(name=req.name, email=email, hashed_password=hash_password(req.password))
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return {"id": owner.id, "name": owner.name, "email": owner.email}


@app.put("/admin/owners/{owner_id}/status")
def admin_set_owner_status(
    owner_id: str,
    req: UserStatusRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    owner = db.query(Owner).filter(Owner.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    owner.enabled = req.enabled
    db.commit()
    return {"message": "Status updated"}


@app.delete("/admin/owners/{owner_id}")
def admin_delete_owner(
    owner_id: str,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    owner = db.query(Owner).filter(Owner.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    db.delete(owner)
    db.commit()
    return {"message": "Owner deleted"}


# ── Owner → User Management ───────────────────────────────────
@app.get("/owner/users")
def owner_list_users(current_owner: Owner = Depends(get_current_owner), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "enabled": u.enabled,
            "tokens": u.tokens,
            "plan": getattr(u, "plan", "free"),
            "created_at": u.created_at,
        }
        for u in users
    ]


@app.put("/owner/users/{user_id}/status")
def owner_set_user_status(
    user_id: str,
    req: UserStatusRequest,
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.enabled = req.enabled
    db.commit()
    return {"message": "Status updated"}


class TokenTopUpRequest(BaseModel):
    amount: int

class UserPlanRequest(BaseModel):
    plan: str

class SystemPromptRequest(BaseModel):
    system_prompt: str


@app.put("/owner/users/{user_id}/tokens")
def owner_topup_tokens(
    user_id: str,
    req: TokenTopUpRequest,
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.tokens += req.amount
    db.commit()
    return {"tokens": user.tokens}


@app.put("/owner/users/{user_id}/plan")
def owner_set_user_plan(
    user_id: str,
    req: UserPlanRequest,
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    if req.plan not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.plan = req.plan
    db.commit()
    return {"plan": user.plan}


@app.get("/owner/users/{user_id}/files")
def owner_list_user_files(
    user_id: str,
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_dir = UPLOAD_DIR / user_id
    if not user_dir.exists():
        return {"files": []}
    files = [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "uploaded_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in user_dir.iterdir() if f.is_file()
    ]
    return {"files": files}


@app.delete("/owner/users/{user_id}")
def owner_delete_user(
    user_id: str,
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


# ── Owner → System Prompt ────────────────────────────────────
@app.get("/owner/system-prompt")
def owner_get_system_prompt(current_owner: Owner = Depends(get_current_owner)):
    return {"system_prompt": _system_prompt}


@app.put("/owner/system-prompt")
def owner_set_system_prompt(
    req: SystemPromptRequest,
    current_owner: Owner = Depends(get_current_owner),
):
    global _system_prompt
    prompt = req.system_prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="System prompt cannot be empty")
    _system_prompt = prompt
    SYSTEM_PROMPT_FILE.write_text(prompt, encoding="utf-8")
    sessions.clear()
    return {"system_prompt": _system_prompt}


# ── Admin → System Prompt ─────────────────────────────────────
@app.get("/admin/system-prompt")
def admin_get_system_prompt(current_admin: Admin = Depends(get_current_admin)):
    return {"system_prompt": _system_prompt}


@app.put("/admin/system-prompt")
def admin_set_system_prompt(
    req: SystemPromptRequest,
    current_admin: Admin = Depends(get_current_admin),
):
    global _system_prompt
    prompt = req.system_prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="System prompt cannot be empty")
    _system_prompt = prompt
    SYSTEM_PROMPT_FILE.write_text(prompt, encoding="utf-8")
    sessions.clear()
    return {"system_prompt": _system_prompt}


# ── Chat Sessions ─────────────────────────────────────────────
@app.get("/chats")
def list_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    actor_type = "owner" if isinstance(current_user, Owner) else "user"
    rows = (
        db.query(ChatSession)
        .filter(ChatSession.actor_id == current_user.id, ChatSession.actor_type == actor_type)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    return [{"id": s.id, "name": s.name, "created_at": s.created_at} for s in rows]


@app.post("/chats", status_code=201)
def create_chat(
    req: CreateChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_type = "owner" if isinstance(current_user, Owner) else "user"
    import uuid as _uuid
    session = ChatSession(
        id=str(_uuid.uuid4()),
        actor_id=current_user.id,
        actor_type=actor_type,
        name=req.name,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@app.get("/chats/{chat_id}/messages")
def get_chat_messages(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_type = "owner" if isinstance(current_user, Owner) else "user"
    session = db.query(ChatSession).filter(
        ChatSession.id == chat_id,
        ChatSession.actor_id == current_user.id,
        ChatSession.actor_type == actor_type,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sources": json.loads(m.sources) if m.sources else [],
            "created_at": m.created_at,
        }
        for m in messages
    ]


@app.put("/chats/{chat_id}")
def rename_chat(
    chat_id: str,
    req: RenameChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_type = "owner" if isinstance(current_user, Owner) else "user"
    session = db.query(ChatSession).filter(
        ChatSession.id == chat_id,
        ChatSession.actor_id == current_user.id,
        ChatSession.actor_type == actor_type,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    session.name = name
    db.commit()
    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@app.delete("/chats/{chat_id}")
def delete_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor_type = "owner" if isinstance(current_user, Owner) else "user"
    session = db.query(ChatSession).filter(
        ChatSession.id == chat_id,
        ChatSession.actor_id == current_user.id,
        ChatSession.actor_type == actor_type,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    db.query(ChatMessage).filter(ChatMessage.session_id == chat_id).delete()
    db.delete(session)
    db.commit()
    sessions.pop(chat_id, None)
    return {"message": "Chat deleted"}


@app.get("/owner/reports")
def owner_reports(
    current_owner: Owner = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    user_report = []
    for u in users:
        user_sessions = db.query(ChatSession).filter(
            ChatSession.actor_id == u.id,
            ChatSession.actor_type == "user",
        ).all()
        session_ids = [s.id for s in user_sessions]
        msg_count = 0
        last_active = None
        if session_ids:
            msgs = db.query(ChatMessage).filter(
                ChatMessage.session_id.in_(session_ids),
                ChatMessage.role == "user",
            ).all()
            msg_count = len(msgs)
            if msgs:
                last_active = max(m.created_at for m in msgs)
        user_report.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "enabled": u.enabled,
            "plan": u.plan,
            "tokens": u.tokens,
            "chat_count": len(user_sessions),
            "message_count": msg_count,
            "last_active": last_active,
            "created_at": u.created_at,
        })
    return {
        "summary": {
            "total_users": len(users),
            "active_users": sum(1 for u in users if u.enabled),
            "total_messages": sum(r["message_count"] for r in user_report),
            "total_chats": sum(r["chat_count"] for r in user_report),
        },
        "users": user_report,
    }


@app.get("/health")
def health():
    return {"status": "ok"}
