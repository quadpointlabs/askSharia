"""One-shot environment doctor for indexing. Run with the SAME interpreter the
app/service uses on EC2, e.g.:

    cd ~/projects/sharia/askSharia
    .venv/bin/python ec2_doctor.py                      # checks env only
    .venv/bin/python ec2_doctor.py "text_files/shared/some.PPTX"   # + run reader

It prints PASS/FAIL for each dependency and, if given a file, runs the exact
reader path and prints the real traceback or the extracted text.
"""
import os
import sys
import shutil
import traceback
from pathlib import Path


def line(label, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {label:32} {detail}")


print("=" * 70)
print("Python:", sys.executable)
print("Version:", sys.version.split()[0])
print("=" * 70)

# 1. Is the NEW code deployed? (case-insensitive gather + SmartPptxReader)
try:
    import indexer
    has_gather = hasattr(indexer, "_gather_supported_files")
    has_smart = "SmartPptxReader" in dir(indexer)
    pptx_reader = type(indexer._FILE_EXTRACTOR.get(".pptx")).__name__
    line("new code deployed", has_gather and has_smart,
         f"_gather={has_gather} SmartPptxReader={has_smart} .pptx->{pptx_reader}")
except Exception as e:
    line("import indexer", False, repr(e))

# 2. lxml.etree (python-pptx / python-docx need it)
try:
    from lxml import etree  # noqa
    import lxml
    line("lxml.etree", True, f"v{lxml.__version__} @ {etree.__file__}")
except Exception as e:
    line("lxml.etree", False, repr(e))

# 3. python-pptx
try:
    import pptx
    line("python-pptx", True, f"v{pptx.__version__}")
except Exception as e:
    line("python-pptx", False, repr(e))

# 4. poppler (pdf2image needs pdftoppm on PATH) — required for scanned PDFs
poppler = shutil.which("pdftoppm")
line("poppler (pdftoppm)", bool(poppler), poppler or "NOT on PATH")

# 5. Anthropic key present
key = os.getenv("ANTHROPIC_API_KEY")
line("ANTHROPIC_API_KEY", bool(key), f"set, len={len(key)}" if key else "MISSING (check .env / service env)")

# 6. tesseract (only for .tiff/.bmp via ImageOCRReader)
tess = shutil.which("tesseract")
line("tesseract (tiff/bmp only)", bool(tess), tess or "not installed")

# 7. Outbound reachability to Anthropic API
try:
    import socket
    socket.create_connection(("api.anthropic.com", 443), timeout=6).close()
    line("egress api.anthropic.com:443", True, "reachable")
except Exception as e:
    line("egress api.anthropic.com:443", False, repr(e))

# 8. Optional: run the real reader on a given file
if len(sys.argv) > 1:
    f = sys.argv[1]
    print("=" * 70)
    print("Running reader on:", f)
    if not Path(f).exists():
        print("  FILE NOT FOUND on this host — check the path/case.")
        sys.exit(1)
    ext = Path(f).suffix.lower()
    try:
        docs = indexer._FILE_EXTRACTOR[ext].load_data(f)
        total = sum(len((d.text or "")) for d in docs)
        print(f"  OK: {len(docs)} doc(s), {total} chars extracted")
        for i, d in enumerate(docs[:2], 1):
            print(f"  [{i}] {repr((d.text or '')[:200])}")
    except Exception:
        print("  RAISED:")
        traceback.print_exc()
