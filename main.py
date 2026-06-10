'''
RAG Chatbot API — FastAPI entry point.
'''

from datetime import datetime
from pathlib import Path
from typing import List, Optional
import logging
import os
import shutil

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

from database import get_db, User
from auth import hash_password, verify_password, create_access_token, get_current_user
from indexer import delete_user_files, index_user_files, SUPPORTED_EXTENSIONS

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

# ── Setup ────────────────────────────────────────────────────
COLLECTION_NAME = "rag_documents"
UPLOAD_DIR = Path("text_files")

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
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ChatRequest(BaseModel):
    question: str

# ── Auth Endpoints ───────────────────────────────────────────
@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=req.name, email=req.email, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token({"sub": user.id}), "token_type": "bearer"}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_access_token({"sub": user.id}), "token_type": "bearer"}


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "created_at": current_user.created_at,
    }

# ── Chat ─────────────────────────────────────────────────────
def get_chat_engine(user_id: str):
    if user_id not in sessions:
        filters = Filter(
            must=[FieldCondition(key="user_id", match=MatchValue(value=str(user_id)))]
        )
        retriever = index.as_retriever(
            similarity_top_k=3,
            vector_store_kwargs={"qdrant_filters": filters},
        )
        sessions[user_id] = CondensePlusContextChatEngine.from_defaults(
            retriever=retriever,
            memory=ChatMemoryBuffer.from_defaults(token_limit=4096),
            llm=llm,
            node_postprocessors=[NumberedSourcePostprocessor()],
            system_prompt=(
                "You are a helpful assistant. Answer ONLY using the provided documents. "
                "Each retrieved passage is labeled with its source file. "
                "If multiple passages come from the same file, use the same citation number for that file. "
                "Cite inline immediately after each statement using [1], [2] format, where the number corresponds to the source file. "
                "If the answer is not in the documents, say: "
                "English: 'This information is not available in the provided documents.' "
                "Arabic: 'هذه المعلومات غير متوفرة في الوثائق المتاحة.' "
                "Hebrew: 'מידע זה אינו זמין במסמכים שסופקו.' "
                "Always respond in the same language the user used."
            ),
            verbose=False,
        )
    return sessions[user_id]


@app.post("/chat")
def chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    try:
        engine = get_chat_engine(current_user.id)
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

        return {
            "answer": answer,
            "sources": sources
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Chat error for user %s", current_user.id)
        raise HTTPException(status_code=500, detail="Chat service error. Please try again.")


# ── File Upload ───────────────────────────────────────────────
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(SUPPORTED_EXTENSIONS)}",
        )
    dest: Optional[Path] = None
    try:
        user_dir = UPLOAD_DIR / current_user.id
        user_dir.mkdir(parents=True, exist_ok=True)
        dest = user_dir / safe_name
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        index_user_files(user_id=current_user.id, file_dir=str(user_dir))
        sessions.pop(current_user.id, None)
        return {"message": f"File '{safe_name}' uploaded and indexed successfully", "file": safe_name}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Upload/index error for user %s, file %s", current_user.id, safe_name)
        if dest and dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to process and index the file.")


# ── List User Files ───────────────────────────────────────────
@app.get("/files")
def list_files(current_user: User = Depends(get_current_user)):
    user_dir = UPLOAD_DIR / current_user.id
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


@app.get("/health")
def health():
    return {"status": "ok"}
