'''
Indexer for document search using Qdrant and HuggingFace embeddings.
'''

import os
import shutil
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from indexer import delete_user_files, index_user_files, SUPPORTED_EXTENSIONS
from pydantic import BaseModel
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.anthropic import Anthropic
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from llama_index.core.chat_engine.condense_plus_context import CondensePlusContextChatEngine
from pathlib import Path

load_dotenv()

COLLECTION_NAME = "rag_documents"


client = QdrantClient(url=os.getenv("QDRANT_URL", "localhost"), port=6333)
embed_model = HuggingFaceEmbedding(model_name="intfloat/multilingual-e5-large")
llm = Anthropic(model="claude-sonnet-4-20250514", api_key=os.environ["ANTHROPIC_API_KEY"])
vector_store = QdrantVectorStore(client=client, collection_name=COLLECTION_NAME)
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_vector_store( vector_store=vector_store, embed_model=embed_model)


# ── Session storage (per user chat history) ──────────────────
sessions = {}

# ── FastAPI ──────────────────────────────────────────────────
app = FastAPI()

class ChatRequest(BaseModel):
    question: str

def get_chat_engine(user_id: str):
    if user_id not in sessions:
        filters = Filter(
            must=[
                FieldCondition(
                    key="user_id",
                    match=MatchValue(value=str(user_id))  # ← force string
                )
            ]
        )

        retriever = index.as_retriever(
            similarity_top_k=3,
            vector_store_kwargs={"qdrant_filters": filters}
        )

        sessions[user_id] = CondensePlusContextChatEngine.from_defaults(
            retriever=retriever,
            memory=ChatMemoryBuffer.from_defaults(token_limit=4096),
            llm=llm,
            system_prompt=(
                "You are a helpful assistant. Answer questions ONLY using "
                "the provided documents. If the answer is not in the documents, say: "
                "English: 'This information is not available in the provided documents.' "
                "Arabic: 'هذه المعلومات غير متوفرة في الوثائق المتاحة.' "
                "Hebrew: 'מידע זה אינו זמין במסמכים שסופקו.' "
                "Always respond in the same language the user used."
            ),
            verbose=False
        )
    return sessions[user_id]

@app.post("/chat/{user_id}")
async def chat(user_id: str, req: ChatRequest):  # ← user_id from path, req from body
    try:
        engine = get_chat_engine(user_id)
        response = engine.chat(req.question)
        return {
            "answer": str(response),
            "sources": [
                n.metadata.get("file_name", "unknown")
                for n in response.source_nodes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/delete/{user_id}")
async def delete_user_data(user_id: str):
    try:
        if user_id in sessions:
            del sessions[user_id]
        delete_user_files(user_id)
        return {"message": f"Deleted data for user: {user_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── File Upload ───────────────────────────────────────────────
UPLOAD_DIR = Path("text_files")

@app.post("/upload/{user_id}")
async def upload_file(user_id: str, file: UploadFile = File(...)):
    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(SUPPORTED_EXTENSIONS)}"
        )
    try:
       user_dir = UPLOAD_DIR / user_id
       user_dir.mkdir(parents=True, exist_ok=True)

       file_path = user_dir / safe_name
       with open(file_path, "wb") as f:
           shutil.copyfileobj(file.file, f)

       index_user_files(user_id=user_id, file_dir=str(user_dir))
       sessions.pop(user_id, None)
       return {"message": f"File '{safe_name}' uploaded and indexed for user: {user_id} successfully.",
               "user_id": user_id,
               "file_name": safe_name
               }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# ── List User Files ───────────────────────────────────────────
@app.get("/files/{user_id}")
async def list_files(user_id: str):
    try:
        user_dir = UPLOAD_DIR / user_id
        if not user_dir.exists() or not user_dir.is_dir():
            return {"user_id": user_id, "files": []}
        
        files = [f.name for f in user_dir.iterdir() if f.is_file()]
        return {"user_id": user_id, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
