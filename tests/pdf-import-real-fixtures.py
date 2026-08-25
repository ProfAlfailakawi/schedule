#!/usr/bin/env python3
"""Regression checks for the real Authority timetable PDFs used by PDF import.

This test intentionally validates source facts before application parsing:
- the real text PDF has the expected per-page row counts;
- cross-branch building codes really occur in the source;
- the known Fahaheel row has building 012F15 with no room token between the
  building and activity cell;
- supplied CamScanner fixtures are genuinely image-only, so they must take the
  scanned/OCR pipeline rather than the text-layer parser.

Usage:
  python3 tests/pdf-import-real-fixtures.py TEXT.pdf SCAN4.pdf [SCAN1.pdf]
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

COURSE_CODE_RE = re.compile(r"(?<!\d)\d{7}(?!\d)")
ROOM_AFTER_BUILDING_RE = re.compile(r"012F15\s+([A-Za-z]\d{1,3})\b")


def require_binary(name: str) -> None:
    if not shutil.which(name):
        raise AssertionError(f"required executable is missing: {name}")


def run(*args: str) -> str:
    p = subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return p.stdout.decode("utf-8", errors="replace")


def pdf_pages(path: Path) -> int:
    info = run("pdfinfo", str(path))
    m = re.search(r"^Pages:\s+(\d+)\s*$", info, flags=re.M)
    if not m:
        raise AssertionError(f"could not read page count: {path}")
    return int(m.group(1))


def page_text(path: Path, page: int) -> str:
    return run("pdftotext", "-f", str(page), "-l", str(page), "-layout", str(path), "-")


def compact_text(path: Path) -> str:
    return run("pdftotext", "-layout", str(path), "-")


def assert_text_fixture(path: Path) -> None:
    assert path.exists(), path
    pages = pdf_pages(path)
    assert pages == 3, f"text fixture page count changed: {pages} != 3"

    counts = []
    for page in range(1, pages + 1):
        text = page_text(path, page)
        counts.append(len(COURSE_CODE_RE.findall(text)))
    assert counts == [28, 28, 26], f"unexpected real row counts: {counts}"
    assert sum(counts) == 82, f"unexpected total real rows: {sum(counts)}"

    text = compact_text(path)
    assert "012F15" in text, "real text fixture no longer contains Fahaheel building 012F15"
    assert "012J14" in text, "real text fixture no longer contains Jahra building 012J14"

    # Course 0101102 is the important section-number regression: the Authority
    # source starts at 501 but legitimately skips 509 and continues at 510.
    # The importer must preserve those printed 5xx values exactly; auto-filling
    # a sequence would silently corrupt section 510 into 509.
    clean_bidi = re.sub(r"[\u202a-\u202e\u2066-\u2069]", "", text)
    sections_101 = []
    for line in clean_bidi.splitlines():
        m = re.search(r"(?:^|\s)(5\d{2})\s+(\d{4,6})\s+0101102", line)
        if m:
            sections_101.append(int(m.group(1)))
    assert sections_101 == [501,502,503,504,505,506,507,508,510], (
        f"source 0101102 section series changed: {sections_101}"
    )

    known = [
        line for line in text.splitlines()
        if "0101206" in line and "18998" in line and "505" in line and "012F15" in line
    ]
    assert len(known) == 1, f"known Fahaheel worship row not uniquely found: {len(known)}"
    # In the source row the physical room cell is blank. A room token such as
    # F15/F151 must therefore never be fabricated from the building token.
    assert not ROOM_AFTER_BUILDING_RE.search(known[0]), (
        "fixture unexpectedly has a room token after 012F15; review the ground truth"
    )

    print("PASS text fixture: 3 pages, rows 28+28+26=82")
    print("PASS source evidence: 0101102 sections preserve 501..508 then legitimate gap to 510")
    print("PASS source evidence: 012F15 and 012J14 are real cross-branch buildings")
    print("PASS known row: 0101206 / section 505 keeps 012F15 with blank room source cell")


def assert_image_only(path: Path, expected_pages: int | None = None) -> None:
    assert path.exists(), path
    pages = pdf_pages(path)
    if expected_pages is not None:
        assert pages == expected_pages, f"scan fixture pages {pages} != {expected_pages}"
    text = compact_text(path)
    visible = re.sub(r"\s+", "", text)
    # Metadata/form-feed noise is fine; meaningful table text would be much larger.
    assert len(visible) <= 20, (
        f"scan fixture unexpectedly exposes a substantial text layer ({len(visible)} chars)"
    )
    assert not COURSE_CODE_RE.search(text), "scan fixture unexpectedly exposes course rows as text"
    print(f"PASS image-only fixture: {path.name} ({pages} page{'s' if pages != 1 else ''})")


def main() -> int:
    require_binary("pdfinfo")
    require_binary("pdftotext")
    if len(sys.argv) not in (3, 4):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    text_pdf = Path(sys.argv[1])
    scan4_pdf = Path(sys.argv[2])
    scan1_pdf = Path(sys.argv[3]) if len(sys.argv) == 4 else None

    assert_text_fixture(text_pdf)
    assert_image_only(scan4_pdf, expected_pages=4)
    if scan1_pdf:
        assert_image_only(scan1_pdf, expected_pages=1)
    print("REAL PDF FIXTURES: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
