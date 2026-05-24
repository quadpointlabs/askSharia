import os
import argparse
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, FilterSelector

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

    documents = SimpleDirectoryReader(input_dir=file_dir, recursive=True).load_data()
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

    # LlamaIndex stores metadata nested under "metadata.*" in the Qdrant payload
    user_filter = Filter(
        must=[
            FieldCondition(
                key="metadata.user_id",
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
