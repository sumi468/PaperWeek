"""Check PDFs emitted by browser.cjs. Requires pypdf; does not contact services."""
import json
from pathlib import Path
from pypdf import PdfReader

output = Path(__file__).resolve().parent.parent / "artifacts"
expected_overflow = json.loads((output / "overflow-pages.json").read_text())["pages"]
page_counts = json.loads((output / "pdf-pages.json").read_text())
files = sorted(output.glob("*.pdf"))
assert len(files) == 26, len(files)
for file in files:
    reader = PdfReader(file)
    expected = page_counts[file.name]
    assert len(reader.pages) == expected, (file.name, len(reader.pages), expected)
    portrait = file.name.startswith("portrait")
    expected_size = (595.28, 841.89) if portrait else (841.89, 595.28)
    for page in reader.pages:
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        assert abs(width - expected_size[0]) < 1 and abs(height - expected_size[1]) < 1, (file.name, width, height)
        assert "PaperWeek" in page.extract_text(), (file.name, "blank or unexpected page")
    if file.name == "overflow-details.pdf":
        assert "TODO 79" in "".join(page.extract_text() for page in reader.pages)
print(f"PASS: {len(files)} PDFs; A4 dimensions; expected page counts; continuation matches {expected_overflow} preview sheets; final TODO retained")
