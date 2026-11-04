"""
Document processing service — Milestone 2 (improved extraction v3).

Improvements over v2:
  - TOC detection: pages/chunks whose content is predominantly TOC entries
    (lines with dot/dash fillers followed by page numbers) are marked
    is_toc=True and excluded from FTS5 indexing.
  - Better PDF extraction: uses pymupdf4llm.to_markdown() per page for
    richer heading structure; falls back to fitz block extraction.
  - Heading-only chunk prevention: chunks that are purely a heading with
    fewer than 20 words of body text are merged into the next chunk.
  - Improved TOC line filtering: regex detects typical TOC entry lines
    (e.g. "1. Introduction ......... 3") and skips them.
  - DOCX: heading-style detection, table extraction with context.
  - TXT: approximate page splitting at paragraph boundaries.
  - Chunking: paragraph-aware (splits on blank lines, not word windows),
    minimum 10 words per chunk, section heading preserved per chunk.
"""

import hashlib
import logging
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from backend.extensions import db
from backend.models.document_models import Document, DocumentChunk, ExtractedFact

log = logging.getLogger(__name__)

CHUNK_TARGET_WORDS   = 280   # aim for ~280 words per chunk
CHUNK_MAX_WORDS      = 450   # hard cap; split paragraph if over this
CHUNK_MIN_WORDS      = 10    # discard chunks smaller than this
SCANNED_PDF_CHARS_PER_PAGE_THRESHOLD = 80


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def process_document(document_id: int, file_path: Path) -> None:
    """Extract, chunk, index and store a document. Idempotent (safe to reprocess)."""
    doc = Document.query.get(document_id)
    if doc is None:
        log.error("process_document: unknown id=%d", document_id)
        return

    _set_status(doc, "extracting")
    warnings = []

    try:
        if doc.file_type == "pdf":
            pages, extra = _extract_pdf(file_path)
        elif doc.file_type == "docx":
            pages, extra = _extract_docx(file_path)
        elif doc.file_type == "txt":
            pages, extra = _extract_txt(file_path)
        else:
            raise ValueError(f"Unsupported file type: {doc.file_type}")

        warnings.extend(extra)

        if not pages:
            warnings.append("No text could be extracted from this file.")
            _set_status(doc, "partial", warnings=warnings)
            return

        # Compute stats
        all_text       = "\n".join(p["text"] for p in pages)
        doc.page_count = max((p["page"] for p in pages if p["page"] is not None), default=None)
        doc.char_count = len(all_text)
        doc.word_count = len(all_text.split())

        if doc.file_type == "pdf" and doc.page_count:
            avg_chars = doc.char_count / doc.page_count
            if avg_chars < SCANNED_PDF_CHARS_PER_PAGE_THRESHOLD:
                doc.is_scanned_pdf = True
                warnings.append(
                    f"This PDF appears to be scanned or image-based "
                    f"(avg {avg_chars:.0f} chars/page). OCR may be needed."
                )

        db.session.flush()

        # Clear stale data
        _clear_existing_chunks_and_facts(doc.id)

        _set_status(doc, "indexing")
        chunks = _create_chunks(doc.id, pages)

        from backend.services.extraction_service import extract_facts
        facts = extract_facts(doc.id, pages, doc.file_type, doc.original_filename)

        for chunk in chunks:
            db.session.add(chunk)
        for fact in facts:
            db.session.add(fact)

        doc.processed_at       = datetime.now(timezone.utc)
        doc.extraction_warnings = "\n".join(warnings) if warnings else None
        doc.status             = "partial" if warnings else "completed"
        db.session.commit()

        from backend.services.fts_service import index_document_chunks
        index_document_chunks(doc.id)

        log.info("Document %d processed: %d chunks, %d facts", doc.id, len(chunks), len(facts))

    except Exception as exc:
        log.exception("Failed to process document %d", document_id)
        doc.status           = "failed"
        doc.processing_error = str(exc)
        doc.processed_at     = datetime.now(timezone.utc)
        db.session.commit()


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

def _extract_pdf(file_path: Path):
    """Extract text from PDF.

    Primary:  pymupdf4llm.to_markdown() per page — preserves headings.
    Fallback: PyMuPDF fitz block-based extraction.

    Improvements:
    - TOC entry detection and marking per page.
    - Repeated header/footer removal.
    - TOC-style lines filtered in cleaning pipeline.
    - Normalise unicode and whitespace.
    """
    try:
        import fitz
    except ImportError:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")

    warnings = []
    raw_pages = []   # list of (page_num, lines, used_md)

    with fitz.open(str(file_path)) as pdf:
        if pdf.is_encrypted:
            raise ValueError("PDF is encrypted. Please provide an unlocked version.")

        for page_num, page in enumerate(pdf, start=1):
            lines = None
            used_md = False

            # --- Attempt pymupdf4llm markdown extraction ---
            try:
                import pymupdf4llm  # noqa: F401
                md_text = pymupdf4llm.to_markdown(str(file_path), pages=[page_num - 1])
                if md_text and md_text.strip():
                    lines = [ln for ln in md_text.splitlines() if ln.strip()]
                    used_md = True
            except Exception:
                pass  # fall through to fitz extraction

            # --- Fallback: fitz block extraction ---
            if not lines:
                blocks = page.get_text("blocks", sort=True)
                lines = []
                for b in blocks:
                    if b[6] != 0:   # skip image blocks
                        continue
                    block_text = b[4].strip()
                    if block_text:
                        lines.append(block_text)

            raw_pages.append((page_num, lines, used_md))

    if not raw_pages:
        return [], warnings

    # --- detect repeated headers/footers ---
    # A line appearing verbatim on >= 40% of pages is likely a header/footer
    all_lines_flat = [ln for _, lines, _ in raw_pages for ln in lines]
    line_freq = Counter(ln.strip() for ln in all_lines_flat if ln.strip())
    threshold = max(3, len(raw_pages) * 0.4)
    repeated = {ln for ln, cnt in line_freq.items() if cnt >= threshold and len(ln) < 120}

    pages = []
    empty_count = 0
    for page_num, lines, _used_md in raw_pages:
        cleaned_lines = []
        for ln in lines:
            stripped = ln.strip()
            # skip repeated header/footer lines
            if stripped in repeated:
                continue
            # skip standalone page numbers: "3", "- 3 -", "Page 3 of 10", "3 of 10"
            if re.fullmatch(r'[\-\s]*\d+[\-\s]*', stripped):
                continue
            if re.fullmatch(r'[Pp]age\s+\d+(\s+of\s+\d+)?', stripped):
                continue
            if re.fullmatch(r'\d+\s+of\s+\d+', stripped):
                continue
            # skip very short meaningless lines (1-2 chars)
            if len(stripped) < 3:
                continue
            cleaned_lines.append(stripped)

        text = _clean_text("\n".join(cleaned_lines))
        if text:
            # Detect if this page is predominantly a Table of Contents
            is_toc_page = _is_toc_page(cleaned_lines)
            pages.append({"page": page_num, "text": text, "is_toc": is_toc_page})
        else:
            empty_count += 1

    if empty_count:
        warnings.append(
            f"{empty_count} page(s) had no extractable text (images, charts, or scanned)."
        )
    return pages, warnings


def _extract_docx(file_path: Path):
    """Extract text from DOCX preserving heading structure."""
    try:
        from docx import Document as DocxDocument
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")

    warnings = []
    doc = DocxDocument(str(file_path))

    # Collect (text, is_heading, heading_level) tuples
    items = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style_name = para.style.name if para.style else ""
        is_heading = "Heading" in style_name or "Title" in style_name
        # Extract heading level from style name if available
        level = 1
        m = re.search(r'(\d)', style_name)
        if m:
            level = int(m.group(1))
        items.append({"text": text, "is_heading": is_heading, "level": level})

    # Also extract table content
    for table in doc.tables:
        for row in table.rows:
            row_cells = []
            for cell in row.cells:
                ct = cell.text.strip()
                if ct:
                    row_cells.append(ct)
            if row_cells:
                # Table rows as pipe-separated text
                items.append({"text": " | ".join(row_cells), "is_heading": False, "level": 0})

    if not items:
        warnings.append("No text paragraphs found in the DOCX file.")
        return [], warnings

    # Group into approximate pages of ~30 paragraphs each
    PARAS_PER_PAGE = 30
    pages = []
    for i in range(0, len(items), PARAS_PER_PAGE):
        group = items[i : i + PARAS_PER_PAGE]
        parts = []
        for it in group:
            if it["is_heading"]:
                prefix = "#" * min(it["level"], 3)
                parts.append(f"{prefix} {it['text']}")
            else:
                parts.append(it["text"])
        text = _clean_text("\n\n".join(parts))
        if text:
            pages.append({"page": (i // PARAS_PER_PAGE) + 1, "text": text})

    warnings.append(
        "DOCX page numbers are approximate (every 30 paragraphs), not actual page breaks."
    )
    return pages, warnings


def _extract_txt(file_path: Path):
    """Extract text from a plain text file, split into ~3000-char pages."""
    warnings = []
    text = None
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = file_path.read_text(encoding=encoding)
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if text is None:
        raise ValueError("Could not decode text file. Try UTF-8, UTF-8-BOM, or Latin-1.")

    text = _clean_text(text)
    if not text:
        warnings.append("The text file appears to be empty.")
        return [], warnings

    # Split into approximate pages at paragraph boundaries
    PAGE_CHARS = 3000
    paragraphs = re.split(r'\n\s*\n', text)
    pages = []
    current_parts = []
    current_len = 0
    page_num = 1

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) > PAGE_CHARS and current_parts:
            page_text = "\n\n".join(current_parts)
            if page_text.strip():
                pages.append({"page": page_num, "text": page_text})
            page_num += 1
            current_parts = [para]
            current_len = len(para)
        else:
            current_parts.append(para)
            current_len += len(para)

    if current_parts:
        page_text = "\n\n".join(current_parts)
        if page_text.strip():
            pages.append({"page": page_num, "text": page_text})

    if len(pages) == 1:
        # Single page: use None for page number so UI shows "No page"
        pages[0]["page"] = None

    return pages, warnings


# ---------------------------------------------------------------------------
# Chunking — paragraph-aware
# ---------------------------------------------------------------------------

def _create_chunks(document_id: int, pages: list) -> list:
    """Paragraph-aware chunking with TOC detection and heading-only prevention.

    Splits on blank lines (paragraph boundaries) instead of fixed word windows.
    Each chunk targets CHUNK_TARGET_WORDS. Long paragraphs are split mid-sentence.
    Short chunks below CHUNK_MIN_WORDS are merged with the next chunk or discarded.

    Heading-only chunks (pure heading with < 20 words of body) are merged with
    the following chunk rather than stored standalone.

    Chunks from TOC pages are marked is_toc=True and will be excluded from FTS5.
    """
    chunks = []
    chunk_index = 0
    current_heading = None  # track nearest heading
    pending_heading_text = None  # heading-only para waiting to merge

    for page_data in pages:
        page_num = page_data["page"]
        text     = page_data["text"]
        page_is_toc = page_data.get("is_toc", False)

        # Split text into paragraphs
        raw_paras = re.split(r'\n\s*\n', text)
        paragraphs = []
        for p in raw_paras:
            p = p.strip()
            if p:
                paragraphs.append(p)

        # Merge short paragraphs with the next one, split huge ones
        merged = _merge_and_split_paragraphs(paragraphs)

        for para in merged:
            words = para.split()
            if len(words) < CHUNK_MIN_WORDS:
                # Update heading tracker but don't store as chunk
                heading = _detect_heading(para)
                if heading:
                    current_heading = heading
                    pending_heading_text = para
                continue

            # Detect and update heading
            heading = _detect_heading(para)
            if heading:
                current_heading = heading

            # --- Heading-only chunk prevention ---
            # If the entire paragraph IS the heading with little body text,
            # hold it and prepend to the next chunk instead.
            body_words = [w for w in words if w not in (heading or "").split()]
            is_heading_only = (
                heading is not None
                and len(body_words) < 20
                and len(words) < 30
            )

            if is_heading_only:
                pending_heading_text = para
                continue

            # Prepend any pending heading-only text
            if pending_heading_text:
                para = pending_heading_text + "\n\n" + para
                pending_heading_text = None
                words = para.split()

            chunk = DocumentChunk(
                document_id     = document_id,
                chunk_index     = chunk_index,
                text            = para,
                page_number     = page_num,
                word_count      = len(words),
                section_heading = current_heading,
                is_toc          = page_is_toc,
            )
            chunks.append(chunk)
            chunk_index += 1

    # If a pending heading-only text was left at the end, store it (rare edge case)
    if pending_heading_text:
        words = pending_heading_text.split()
        if len(words) >= CHUNK_MIN_WORDS:
            chunk = DocumentChunk(
                document_id     = document_id,
                chunk_index     = chunk_index,
                text            = pending_heading_text,
                page_number     = None,
                word_count      = len(words),
                section_heading = current_heading,
                is_toc          = False,
            )
            chunks.append(chunk)

    return chunks


def _merge_and_split_paragraphs(paragraphs: list) -> list:
    """Merge tiny paragraphs and split oversized ones."""
    result = []
    buffer = []
    buf_words = 0

    for para in paragraphs:
        words = para.split()
        wc    = len(words)

        if wc > CHUNK_MAX_WORDS:
            # Flush buffer first
            if buffer:
                result.append("\n\n".join(buffer))
                buffer, buf_words = [], 0
            # Split long paragraph into sentence groups
            result.extend(_split_long_para(para))
        elif buf_words + wc > CHUNK_TARGET_WORDS and buffer:
            result.append("\n\n".join(buffer))
            buffer, buf_words = [para], wc
        else:
            buffer.append(para)
            buf_words += wc

    if buffer:
        result.append("\n\n".join(buffer))

    return result


def _split_long_para(para: str) -> list:
    """Split a very long paragraph into ~CHUNK_TARGET_WORDS sentence groups."""
    sentences = re.split(r'(?<=[.!?])\s+', para)
    groups = []
    current = []
    cur_words = 0

    for sent in sentences:
        sw = len(sent.split())
        if cur_words + sw > CHUNK_TARGET_WORDS and current:
            groups.append(" ".join(current))
            current, cur_words = [sent], sw
        else:
            current.append(sent)
            cur_words += sw

    if current:
        groups.append(" ".join(current))

    return [g for g in groups if len(g.split()) >= CHUNK_MIN_WORDS]


# ---------------------------------------------------------------------------
# Cleaning utilities
# ---------------------------------------------------------------------------

def _clean_text(text: str) -> str:
    """Comprehensive text cleaning pipeline."""
    # Normalise unicode (e.g. smart quotes, em-dash)
    text = _normalise_unicode(text)
    # Collapse excessive whitespace within lines
    text = re.sub(r'[ \t]{2,}', ' ', text)
    # Remove lines that are only special characters or numbers
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        # Skip lines that are only punctuation/numbers/symbols
        if re.fullmatch(r'[\d\s\.\-\_\*\#\=\|\~\^\+\/\\]+', stripped):
            continue
        # Skip very short lines (< 3 chars) unless they look like bullet items
        if len(stripped) < 3 and not stripped.startswith(('-', '*', '•')):
            continue
        # Skip TOC-style entry lines: "1. Introduction ......... 3"
        if re.match(
            r'^[\d\s\.]+\s+\w.{3,50}\s*[\.·\-]{3,}\s*\d+\s*$', stripped
        ):
            continue
        lines.append(line)
    text = "\n".join(lines)
    # Collapse 3+ consecutive blank lines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _normalise_unicode(text: str) -> str:
    """Replace common Unicode characters with ASCII equivalents."""
    replacements = {
        '\u2019': "'",   # right single quotation mark
        '\u2018': "'",   # left single quotation mark
        '\u201c': '"',   # left double quotation mark
        '\u201d': '"',   # right double quotation mark
        '\u2014': ' - ', # em dash
        '\u2013': ' - ', # en dash
        '\u2022': '-',   # bullet
        '\u00b7': '-',   # middle dot
        '\u2026': '...', # ellipsis
        '\u00a0': ' ',   # non-breaking space
        '\u00ad': '',    # soft hyphen
        '\ufeff': '',    # BOM
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    # Normalise to NFC to combine accented characters
    text = unicodedata.normalize('NFC', text)
    return text


def _is_toc_page(lines: list) -> bool:
    """Heuristically determine if a page is a Table of Contents.

    A page is considered a TOC if >= 40% of its non-empty lines match the
    TOC entry pattern: numbered title followed by dot/dash fillers and a page number.
    """
    if not lines:
        return False
    toc_pattern = re.compile(
        r'^[\d\s\.]*\s*\w.{2,60}\s*[\.·\-]{3,}\s*\d+\s*$'
    )
    # Also match lines that are just "Table of Contents" / "Contents"
    header_pattern = re.compile(r'^\s*(table\s+of\s+)?contents?\s*$', re.IGNORECASE)

    non_empty = [ln.strip() for ln in lines if ln.strip()]
    if not non_empty:
        return False

    # If the first line is a TOC header, that's a strong signal
    if header_pattern.match(non_empty[0]):
        return True

    toc_matches = sum(1 for ln in non_empty if toc_pattern.match(ln))
    return (toc_matches / len(non_empty)) >= 0.4


def _detect_heading(text: str) -> str | None:
    """Heuristically detect whether text starts with a section heading."""
    first_line = text.split("\n")[0].strip()
    if not first_line:
        return None

    # Markdown-style heading prefixed by _extract_docx
    if re.match(r'^#{1,3}\s+', first_line):
        return re.sub(r'^#{1,3}\s+', '', first_line).strip()

    # Numbered section: "1.", "1.2", "2.3.1" followed by title-case text
    if re.match(r'^\d+(\.\d+)*\.?\s+[A-Z]', first_line) and len(first_line) < 100:
        return first_line

    # ALL CAPS short line
    if first_line.isupper() and 3 < len(first_line) < 80:
        return first_line

    # Title Case short line (most words capitalised)
    words = first_line.split()
    if 2 <= len(words) <= 10:
        cap_count = sum(1 for w in words if w and w[0].isupper())
        if cap_count / len(words) >= 0.7 and len(first_line) < 80:
            return first_line

    return None


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def _set_status(doc, status, warnings=None):
    doc.status = status
    if warnings:
        doc.extraction_warnings = "\n".join(warnings)
    db.session.flush()


def _clear_existing_chunks_and_facts(document_id):
    DocumentChunk.query.filter_by(document_id=document_id).delete()
    ExtractedFact.query.filter_by(document_id=document_id).delete()
    db.session.flush()
    try:
        from backend.services.fts_service import remove_document_from_fts
        remove_document_from_fts(document_id)
    except Exception:
        pass


def sha256_of_file(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()
