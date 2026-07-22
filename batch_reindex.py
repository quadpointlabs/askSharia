import os, glob, tempfile, shutil
from indexer import index_user_files

SHARED = "/home/ubuntu/askSharia/text_files/shared"
files = sorted(glob.glob(os.path.join(SHARED, "*")))
print(f"Total files: {len(files)}", flush=True)

BATCH = 3   # small, since some files are huge
for i in range(0, len(files), BATCH):
    batch = files[i:i+BATCH]
    with tempfile.TemporaryDirectory() as tmp:
        for f in batch:
            if os.path.isfile(f):
                shutil.copy(f, tmp)
        names = [os.path.basename(f) for f in batch]
        print(f"=== Batch {i//BATCH+1}: {names} ===", flush=True)
        try:
            index_user_files(user_id="shared", file_dir=tmp)
            print(f"    Batch {i//BATCH+1} OK", flush=True)
        except Exception as e:
            print(f"    Batch {i//BATCH+1} FAILED: {e}", flush=True)
print("ALL DONE", flush=True)
