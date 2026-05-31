#!/usr/bin/env python3
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def extract_docx(path: Path) -> str:
    parts = []
    xml_paths = [
        "word/document.xml",
        "word/footnotes.xml",
        "word/endnotes.xml",
    ]

    with zipfile.ZipFile(path) as archive:
        for xml_path in xml_paths:
            if xml_path not in archive.namelist():
                continue
            root = ET.fromstring(archive.read(xml_path))
            for paragraph in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                text = "".join(
                    node.text or ""
                    for node in paragraph.iter(
                        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
                    )
                ).strip()
                if text:
                    parts.append(text)

    return "\n".join(parts)


def extract_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        pass

    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        pass

    try:
        from pdfminer.high_level import extract_text

        return extract_text(str(path))
    except ImportError:
        raise RuntimeError(
            "PDF extraction requires a local PDF parser. Install one with: .venv/bin/pip install pypdf"
        )


def normalize(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: extract_transcript_file.py <file>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    suffix = path.suffix.lower()

    try:
        if suffix == ".docx":
            text = extract_docx(path)
        elif suffix == ".pdf":
            text = extract_pdf(path)
        else:
            text = path.read_text(encoding="utf-8", errors="replace")

        text = normalize(text)
        if not text:
            raise RuntimeError("No readable transcript text was found in this file.")

        sys.stdout.write(text)
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
