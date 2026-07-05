import logging
import os
import argparse
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.readers.file import DocxReader, PptxReader, PandasExcelReader
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, FilterSelector
from pathlib import Path
from PIL import Image
import pytesseract
import pypdf
from pdf2image import convert_from_path
import anthropic
import base64
import io

# Tesseract language pack — extend this string if more languages are needed
_OCR_LANG = "eng+ara+heb"
# PDFs with fewer characters than this per page are treated as scanned
_OCR_TEXT_THRESHOLD = 50

# Claude model used for vision OCR — far better than Tesseract for Arabic/Hebrew
_VISION_MODEL = "claude-haiku-4-5-20251001"
_OCR_PROMPT = (
    "Please extract ALL text from this image exactly as it appears. "
    "Preserve the original language (Arabic, Hebrew, English). "
    "Do not translate or summarize — just extract the raw text. "
    "If the image contains no readable text, return an empty response."
)

_anthropic_client = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _anthropic_client


def _claude_ocr(image_b64: str, media_type: str) -> str:
    """Send a base64-encoded image to Claude and return the extracted text."""
    client = _get_anthropic_client()
    message = client.messages.create(
        model=_VISION_MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": _OCR_PROMPT},
                ],
            }
        ],
    )
    if not message.content:
        return ""
    return message.content[0].text or ""


class SmartPDFReader(BaseReader):
    """Extracts text from PDFs; falls back to Claude Vision OCR for scanned/image-only pages."""

    def load_data(self, file, extra_info=None):
        path = Path(file)
        try:
            pages_text = []
            with open(path, "rb") as f:
                reader = pypdf.PdfReader(f)
                for page in reader.pages:
                    pages_text.append(page.extract_text() or "")

            avg_chars = sum(len(t) for t in pages_text) / max(len(pages_text), 1)
            if avg_chars < _OCR_TEXT_THRESHOLD:
                # Scanned/image-only PDF — rasterize each page and OCR via Claude,
                # which is dramatically better than Tesseract for Arabic/Hebrew.
                images = convert_from_path(str(path))
                pages_text = []
                for img in images:
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    page_b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
                    pages_text.append(_claude_ocr(page_b64, "image/png"))

            return [Document(text="\n\n".join(pages_text), metadata=extra_info or {})]
        except Exception as e:
            raise RuntimeError(f"Failed to read PDF '{path.name}': {e}") from e


class ClaudeVisionReader(BaseReader):
    """Uses Claude to extract text from images — much better than Tesseract for Arabic."""

    def load_data(self, file, extra_info=None):
        path = Path(file)
        try:
            with open(file, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")

            ext = path.suffix.lower()
            media_type_map = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp"
            }
            media_type = media_type_map.get(ext, "image/jpeg")

            extracted_text = _claude_ocr(image_data, media_type)
            return [Document(text=extracted_text, metadata=extra_info or {})]
        except Exception as e:
            raise RuntimeError(f"Failed to extract text from image '{path.name}': {e}") from e

class ImageOCRReader(BaseReader):
    """Extracts text from image files using Tesseract OCR."""

    def load_data(self, file, extra_info=None):
        path = Path(file)
        try:
            text = pytesseract.image_to_string(Image.open(file), lang=_OCR_LANG)
            return [Document(text=text, metadata=extra_info or {})]
        except Exception as e:
            raise RuntimeError(f"OCR failed for '{path.name}': {e}") from e


SUPPORTED_EXTENSIONS = [
    ".pdf",
    ".txt",
    ".docx", ".pptx", ".xlsx", ".xls",
    ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp",
]

_FILE_EXTRACTOR = {
    ".pdf":  SmartPDFReader(),
    ".docx": DocxReader(),
    ".pptx": PptxReader(),
    ".xlsx": PandasExcelReader(),
    ".xls":  PandasExcelReader(),
    ".jpg":  ClaudeVisionReader(),   # ← Claude instead of Tesseract
    ".jpeg": ClaudeVisionReader(),   # ← Claude instead of Tesseract
    ".png":  ClaudeVisionReader(),   # ← Claude instead of Tesseract
    ".tiff": ImageOCRReader(),       # ← Keep Tesseract for TIFF
    ".tif":  ImageOCRReader(),
    ".bmp":  ImageOCRReader(),
}



load_dotenv()

COLLECTION_NAME = "rag_documents"

_client = None
_embed_model = None
_storage_context = None
_splitter = None


def _get_resources():
    global _client, _embed_model, _storage_context, _splitter
    if _client is None:
        try:
            _client = QdrantClient(url=os.getenv("QDRANT_URL", "localhost"), port=6333)
            _embed_model = HuggingFaceEmbedding(model_name="intfloat/multilingual-e5-large")
            vector_store = QdrantVectorStore(client=_client, collection_name=COLLECTION_NAME)
            _storage_context = StorageContext.from_defaults(vector_store=vector_store)
            _splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)
        except Exception as e:
            _client = None  # allow retry on next call
            raise RuntimeError(f"Failed to initialize indexer resources: {e}") from e
    return _client, _embed_model, _storage_context, _splitter


def index_user_files(user_id: str, file_dir: str):
    if not os.path.isdir(file_dir) or not os.listdir(file_dir):
        raise ValueError(f"No files found in directory: {file_dir}")

    logger.info("Indexing files for user %s from directory %s", user_id, file_dir)
    client, embed_model, storage_context, splitter = _get_resources()

    documents = SimpleDirectoryReader(
        input_dir=file_dir,
        recursive=True,
        required_exts=SUPPORTED_EXTENSIONS,
        file_extractor=_FILE_EXTRACTOR,
    ).load_data()
    for doc in documents:
        doc.metadata['user_id'] = user_id
    logger.info("Loaded %d documents for user %s", len(documents), user_id)

    VectorStoreIndex.from_documents(
        documents,
        storage_context=storage_context,
        embed_model=embed_model,
        transformations=[splitter],
        show_progress=True
    )
    logger.info("Indexed %d documents for user %s", len(documents), user_id)


def get_indexed_filenames(user_id: str) -> set:
    """Return the set of file names that have at least one indexed point for this user.

    Used to show indexing status in the UI. Returns an empty set if the collection
    does not exist yet or Qdrant is unreachable, so listing never fails on this.
    """
    try:
        client, _, _, _ = _get_resources()
    except Exception:
        logger.exception("Could not init resources while reading indexed filenames for %s", user_id)
        return set()

    user_filter = Filter(
        must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
    )
    names = set()
    offset = None
    try:
        while True:
            points, offset = client.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter=user_filter,
                with_payload=["file_name"],
                with_vectors=False,
                limit=256,
                offset=offset,
            )
            for p in points:
                fn = (p.payload or {}).get("file_name")
                if fn:
                    names.add(fn)
            if offset is None:
                break
    except Exception:
        logger.exception("Failed to read indexed filenames for user %s", user_id)
        return set()
    return names


def delete_user_files(user_id: str):
    logger.info("Deleting indexed documents for user %s", user_id)
    client, _, _, _ = _get_resources()

    user_filter = Filter(
        must=[
            FieldCondition(
                key="user_id",
                match=MatchValue(value=user_id)
            )
        ]
    )

    client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=FilterSelector(filter=user_filter)
    )
    logger.info("Deleted indexed documents for user %s", user_id)


def main(args):
    index_user_files(user_id=args.user, file_dir=args.dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Indexer for document search')
    parser.add_argument('--user', type=str, required=True, help='Username for indexing and searching')
    parser.add_argument('--dir', type=str, required=True, help='Directory containing documents to index')
    args = parser.parse_args()
    main(args)
