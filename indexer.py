import os
import argparse
from dotenv import load_dotenv
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

# Tesseract language pack — extend this string if more languages are needed
_OCR_LANG = "eng+ara+heb"
# PDFs with fewer characters than this per page are treated as scanned
_OCR_TEXT_THRESHOLD = 50


class SmartPDFReader(BaseReader):
    """Extracts text from PDFs; falls back to Tesseract OCR for scanned/image-only pages."""

    def load_data(self, file, extra_info=None):
        path = Path(file)
        pages_text = []
        with open(path, "rb") as f:
            reader = pypdf.PdfReader(f)
            for page in reader.pages:
                pages_text.append(page.extract_text() or "")

        avg_chars = sum(len(t) for t in pages_text) / max(len(pages_text), 1)
        if avg_chars < _OCR_TEXT_THRESHOLD:
            images = convert_from_path(str(path))
            pages_text = [pytesseract.image_to_string(img, lang=_OCR_LANG) for img in images]

        return [Document(text="\n\n".join(pages_text), metadata=extra_info or {})]


class ImageOCRReader(BaseReader):
    """Extracts text from image files using Tesseract OCR."""

    def load_data(self, file, extra_info=None):
        text = pytesseract.image_to_string(Image.open(file), lang=_OCR_LANG)
        return [Document(text=text, metadata=extra_info or {})]


SUPPORTED_EXTENSIONS = [
    ".pdf",
    ".docx", ".pptx", ".xlsx", ".xls",
    ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp",
]

_FILE_EXTRACTOR = {
    ".pdf":  SmartPDFReader(),
    ".docx": DocxReader(),
    ".pptx": PptxReader(),
    ".xlsx": PandasExcelReader(),
    ".xls":  PandasExcelReader(),
    ".jpg":  ImageOCRReader(),
    ".jpeg": ImageOCRReader(),
    ".png":  ImageOCRReader(),
    ".tiff": ImageOCRReader(),
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
        _client = QdrantClient(url=os.getenv("QDRANT_URL", "localhost"), port=6333)
        _embed_model = HuggingFaceEmbedding(model_name="intfloat/multilingual-e5-large")
        vector_store = QdrantVectorStore(client=_client, collection_name=COLLECTION_NAME)
        _storage_context = StorageContext.from_defaults(vector_store=vector_store)
        _splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)
    return _client, _embed_model, _storage_context, _splitter


def index_user_files(user_id: str, file_dir: str):
    if not os.path.isdir(file_dir) or not os.listdir(file_dir):
        raise ValueError(f"No files found in directory: {file_dir}")

    print(f"Indexing files for user: {user_id} from directory: {file_dir}")
    client, embed_model, storage_context, splitter = _get_resources()

    documents = SimpleDirectoryReader(
        input_dir=file_dir,
        recursive=True,
        required_exts=SUPPORTED_EXTENSIONS,
        file_extractor=_FILE_EXTRACTOR,
    ).load_data()
    for doc in documents:
        doc.metadata['user_id'] = user_id
    print(f"Loaded {len(documents)} documents for user: {user_id}")

    VectorStoreIndex.from_documents(
        documents,
        storage_context=storage_context,
        embed_model=embed_model,
        transformations=[splitter],
        show_progress=True
    )
    print(f"Indexed {len(documents)} documents for user: {user_id}")


def delete_user_files(user_id: str):
    print(f"Deleting indexed documents for user: {user_id}")
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
    print(f"Deleted indexed documents for user: {user_id}")


def main(args):
    index_user_files(user_id=args.user, file_dir=args.dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Indexer for document search')
    parser.add_argument('--user', type=str, required=True, help='Username for indexing and searching')
    parser.add_argument('--dir', type=str, required=True, help='Directory containing documents to index')
    args = parser.parse_args()
    main(args)
