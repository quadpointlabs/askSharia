import sys, os, logging
logging.basicConfig(level=logging.INFO)
from indexer import index_single_file

SHARED = "/home/ubuntu/askSharia/text_files/shared"

if len(sys.argv) < 2:
    print("Usage: python index_big_book.py '<filename>'")
    sys.exit(1)

filename = sys.argv[1]
path = os.path.join(SHARED, filename)
if not os.path.isfile(path):
    print(f"File not found: {path}")
    sys.exit(1)

print(f"Indexing {filename} (this may take a long time for scanned books)...")
try:
    index_single_file(user_id="shared", file_path=path)
    print(f"DONE: {filename} indexed successfully")
except Exception as e:
    print(f"FAILED: {e}")
