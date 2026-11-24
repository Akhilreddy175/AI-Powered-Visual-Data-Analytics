"""
SQLite FTS5 full-text search service — v3.

Key design principles:
  - Stop-word filtering to avoid noise from function words.
  - Apostrophes and special chars stripped before FTS5 to avoid syntax errors.
  - Progressive strategy: phrase → AND → NEAR → term-pair OR (no broad OR).
  - Terms shorter than 3 chars dropped (except known acronyms like PPE).
  - Porter stemming via FTS5 tokenizer handles morphological variants.

FTS5 table schema:
    chunk_text        - indexed full text content
    chunk_id          - document_chunk.id (UNINDEXED, for JOINs)
    document_id       - FK as text (UNINDEXED, for filtering)
    page_number       - page ref as text (UNINDEXED)
    section_heading   - nearest section heading (UNINDEXED, shown in search UI)
"""

import logging
import re
import sqlite3
from pathlib import Path

log = logging.getLogger(__name__)

_DB_PATH: Path = Path(__file__).resolve().parent.parent / "instance" / "app.db"
_USE_FTS: bool = True


def configure(sqlalchemy_uri: str) -> None:
    """Configure FTS to use the same DB file as SQLAlchemy."""
    global _DB_PATH, _USE_FTS
    if sqlalchemy_uri.startswith("sqlite:///"):
        path_part = sqlalchemy_uri[len("sqlite:///"):]
        if path_part in (":memory:", "") or not Path(path_part).is_absolute():
            _USE_FTS = False
            log.info("FTS5 disabled - in-memory SQLite.")
        else:
            _DB_PATH = Path(path_part)
            _USE_FTS = True


def _get_conn():
    if not _USE_FTS:
        return None
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def ensure_fts_table() -> None:
    """Create the FTS5 virtual table. Drops and recreates if schema changed."""
    conn = _get_conn()
    if conn is None:
        return
    try:
        # Check if the table already has section_heading column
        try:
            conn.execute("SELECT section_heading FROM document_fts LIMIT 1")
            conn.close()
            log.info("FTS5 table ready (existing).")
            return
        except sqlite3.OperationalError:
            log.info("FTS5 table schema outdated, recreating...")
            conn.execute("DROP TABLE IF EXISTS document_fts")
            conn.commit()

        conn.execute("""
            CREATE VIRTUAL TABLE document_fts
            USING fts5(
                chunk_text,
                chunk_id        UNINDEXED,
                document_id     UNINDEXED,
                page_number     UNINDEXED,
                section_heading UNINDEXED,
                tokenize = 'porter unicode61'
            )
        """)
        conn.commit()
        log.info("FTS5 table created.")
    except sqlite3.Error as exc:
        log.error("Failed to create FTS5 table: %s", exc)
    finally:
        conn.close()


def index_document_chunks(document_id: int) -> None:
    """Index all non-TOC chunks for a document. Idempotent.

    Chunks marked is_toc=1 are kept in document_chunk for navigation
    purposes but are NOT inserted into the FTS5 index so they don't
    pollute search results.
    """
    conn = _get_conn()
    if conn is None:
        log.debug("FTS5 indexing skipped (disabled).")
        return
    ensure_fts_table()
    try:
        # Fetch is_toc if the column exists (graceful fallback for old DBs)
        try:
            rows = conn.execute(
                "SELECT id, text, document_id, page_number, section_heading, is_toc "
                "FROM document_chunk WHERE document_id = ?",
                (document_id,),
            ).fetchall()
        except sqlite3.OperationalError:
            # is_toc column not present yet — treat all rows as non-TOC
            rows = conn.execute(
                "SELECT id, text, document_id, page_number, section_heading, 0 AS is_toc "
                "FROM document_chunk WHERE document_id = ?",
                (document_id,),
            ).fetchall()

        if not rows:
            log.warning("No chunks for document %d - nothing to index.", document_id)
            return

        # Filter out TOC chunks
        indexable = [r for r in rows if not r["is_toc"]]
        toc_count  = len(rows) - len(indexable)
        if toc_count:
            log.info("FTS5: skipping %d TOC chunk(s) for document %d.", toc_count, document_id)

        conn.execute("DELETE FROM document_fts WHERE document_id = ?", (str(document_id),))
        conn.executemany(
            "INSERT INTO document_fts(chunk_text, chunk_id, document_id, page_number, section_heading) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                (
                    row["text"],
                    str(row["id"]),
                    str(row["document_id"]),
                    str(row["page_number"]) if row["page_number"] is not None else "",
                    row["section_heading"] or "",
                )
                for row in indexable
            ],
        )
        conn.commit()
        log.info("FTS5: indexed %d chunks for document %d.", len(indexable), document_id)
    except sqlite3.Error as exc:
        log.error("FTS5 indexing failed for document %d: %s", document_id, exc)
    finally:
        conn.close()


def remove_document_from_fts(document_id: int) -> None:
    conn = _get_conn()
    if conn is None:
        return
    ensure_fts_table()
    try:
        conn.execute("DELETE FROM document_fts WHERE document_id = ?", (str(document_id),))
        conn.commit()
    except sqlite3.Error as exc:
        log.error("FTS5 removal failed for document %d: %s", document_id, exc)
    finally:
        conn.close()


def search(query: str, document_id=None, file_type=None, limit=20, offset=0) -> dict:
    """Full-text search with progressive query fallback.

    Strategy order (most precise → broadest):
      1. Exact phrase (2-5 content words)
      2. All terms AND (default FTS5 behaviour)
      3. NEAR match within 10 tokens
      4. Best-pair OR (top 2 most specific terms only)

    Returns: {results: [...], total: int, query: str, strategy: str}
    Each result includes snippet (highlighted HTML) and text (raw chunk excerpt).
    """
    terms = _extract_terms(query)
    if not terms:
        return {"results": [], "total": 0, "query": query}

    conn = _get_conn()
    if conn is None:
        return {"results": [], "total": 0, "query": query}
    ensure_fts_table()

    try:
        strategies = _build_query_strategies(terms)

        # Build extra WHERE conditions for document_id and file_type filters
        doc_cond   = ""
        doc_params = []
        if document_id is not None:
            doc_cond = "AND document_fts.document_id = ?"
            doc_params.append(str(document_id))

        file_cond   = ""
        file_params = []
        if file_type is not None:
            file_cond = "AND d.file_type = ?"
            file_params.append(file_type)

        status_cond = "AND d.status IN ('completed','partial')"

        for fts_query in strategies:
            try:
                # --- COUNT (no rank referenced) ---
                count_sql = f"""
                    SELECT COUNT(*)
                    FROM document_fts
                    JOIN document d ON d.id = CAST(document_fts.document_id AS INTEGER)
                    WHERE document_fts MATCH ?
                    {doc_cond} {status_cond} {file_cond}
                """
                count_params = [fts_query] + doc_params + file_params
                total = conn.execute(count_sql, count_params).fetchone()[0]

                if total == 0:
                    continue

                # --- RANKED RESULTS ---
                result_sql = f"""
                    SELECT
                        CAST(document_fts.chunk_id    AS INTEGER) AS chunk_id,
                        CAST(document_fts.document_id AS INTEGER) AS document_id,
                        CASE WHEN document_fts.page_number = '' THEN NULL
                             ELSE CAST(document_fts.page_number AS INTEGER)
                        END AS page_number,
                        CASE WHEN document_fts.section_heading = '' THEN NULL
                             ELSE document_fts.section_heading
                        END AS section_heading,
                        d.original_filename AS document_name,
                        d.file_type         AS file_type,
                        snippet(document_fts, 0, '<mark>', '</mark>', '...', 48) AS snippet,
                        substr(document_fts.chunk_text, 1, 600) AS text
                    FROM document_fts
                    JOIN document d ON d.id = CAST(document_fts.document_id AS INTEGER)
                    WHERE document_fts MATCH ?
                    {doc_cond} {status_cond} {file_cond}
                    ORDER BY rank
                    LIMIT ? OFFSET ?
                """
                result_params = [fts_query] + doc_params + file_params + [limit, offset]
                rows = conn.execute(result_sql, result_params).fetchall()

                results = [
                    {
                        "chunk_id":        row["chunk_id"],
                        "document_id":     row["document_id"],
                        "document_name":   row["document_name"],
                        "file_type":       row["file_type"],
                        "page_number":     row["page_number"],
                        "section_heading": row["section_heading"],
                        "snippet":         row["snippet"] or "",
                        "text":            row["text"] or "",
                        "rank":            None,  # rank not serialised (negative float)
                    }
                    for row in rows
                ]
                return {
                    "results":  results,
                    "total":    total,
                    "query":    query,
                    "strategy": fts_query,
                }

            except sqlite3.OperationalError as exc:
                log.warning("FTS5 query %r failed: %s — trying next strategy", fts_query, exc)
                continue

        return {"results": [], "total": 0, "query": query}

    except sqlite3.OperationalError as exc:
        log.warning("FTS5 search error for %r: %s", query, exc)
        return {"results": [], "total": 0, "query": query, "error": str(exc)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Common English stop words — function words that add noise without meaning
# ---------------------------------------------------------------------------
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "not", "but", "if", "in", "on", "at",
    "to", "of", "with", "by", "from", "about", "as", "into", "that", "this",
    "these", "those", "it", "its", "so", "any", "all", "my", "your",
    "our", "their", "can", "could", "would", "should", "will", "may",
    "might", "shall", "than", "then", "some", "such", "no", "nor",
    "per", "via", "eg", "ie", "etc",
    # pronouns
    "i", "me", "we", "us", "he", "she", "they", "him", "her", "them",
    # common verbs (function use)
    "is", "are", "am", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did",
    # question words  
    "what", "how", "when", "where", "which", "who", "whom", "whose",
    "why", "there",
    # other high-frequency words that add little discriminative value
    "get", "got", "use", "used", "make", "made", "also", "just",
    "more", "most", "over", "under", "each", "every", "much", "many",
    "tell", "show", "give", "take", "describe", "explain", "list",
    "provide", "include", "ensure", "must", "need", "needs",
    "based", "related", "given", "including", "regarding",
}

# Short known acronyms to preserve even though they're < 4 chars
_KEEP_SHORT = {"ppe", "ppe's", "ppe'", "ppe"}


def _extract_terms(raw: str) -> list:
    """
    Extract meaningful search terms from a raw query string.

    - Strips apostrophes and special FTS5 syntax characters to avoid parse errors.
    - Filters stop words and low-information words.
    - Deduplicates while preserving order.
    - Keeps known short acronyms (PPE).
    """
    # Remove apostrophes entirely (prevents FTS5 syntax errors like "company's")
    # Keep hyphens inside words (e.g. "no-hardhat"), strip other punctuation
    clean = re.sub(r"'", "", raw)                       # drop apostrophes
    clean = re.sub(r'[^\w\s\-]', ' ', clean, flags=re.UNICODE)  # other punct → space
    tokens = []
    seen = set()
    for t in clean.split():
        t = t.strip("-")
        tl = t.lower()
        # Keep if: not a stop word AND (length >= 4 OR it's a known short acronym)
        if tl in _STOP_WORDS:
            continue
        if len(t) < 4 and tl not in _KEEP_SHORT:
            continue
        if tl not in seen:
            seen.add(tl)
            tokens.append(t)
    return tokens


def _build_query_strategies(terms: list) -> list:
    """
    Return FTS5 query strings to try in order (most precise first).

    Strategies:
      1. Exact phrase — only for 2-4 term queries
      2. AND of all terms — requires all terms present
      3. NEAR — all terms within 10 tokens
      4. Specific-pair OR — the two most domain-specific terms joined by OR.
         Only terms NOT in _GENERIC_FTS_TERMS are used for the OR fallback,
         preventing overly broad matches on words like "requirements" or "workers"
         that appear in almost every safety document passage.
         If no specific terms exist, the OR strategy is skipped entirely.
    """
    if not terms:
        return []

    if len(terms) == 1:
        return [terms[0]]

    strategies = []

    # 1. Exact phrase (best for 2-4 specific content words)
    if 2 <= len(terms) <= 4:
        strategies.append(f'"{" ".join(terms)}"')

    # 2. AND of all terms
    strategies.append(" ".join(terms))

    # 3. NEAR match (all terms within 10 tokens of each other)
    if 2 <= len(terms) <= 5:
        strategies.append(f'NEAR({" ".join(terms)}, 10)')

    # 4. OR fallback using only domain-specific terms (not generic safety vocab).
    #    Sort by length then filter out generic terms to get the most distinctive ones.
    ranked = sorted(terms, key=len, reverse=True)
    specific = [t for t in ranked if t.lower() not in _GENERIC_FTS_TERMS]

    if len(specific) >= 2:
        strategies.append(f'"{specific[0]}" OR "{specific[1]}"')
    elif len(specific) == 1:
        strategies.append(specific[0])
    # If all terms are generic, skip the OR fallback — returning nothing is better
    # than matching every document in the index.

    return strategies


# Terms so common in safety/technical documents that using them as a sole OR
# fallback would match almost any passage, returning irrelevant results.
# These are still used in AND/NEAR strategies — only excluded from the OR fallback.
_GENERIC_FTS_TERMS = {
    # Safety domain universals
    "safety", "safe",
    "work", "working", "worked", "worker", "workers", "workplace", "worksite",
    "hazard", "hazards",
    "requirement", "requirements",
    "procedure", "procedures",
    "regulation", "regulations",
    "standard", "standards",
    "protection", "protective",
    "equipment",
    "personnel",
    "site", "area", "areas",
    "risk", "risks",
    "control", "controls",
    "policy", "policies",
    "operation", "operations",
    "instruction", "instructions",
    "section", "chapter",
    "comply", "compliance",
    "general",
    # Question-word remnants
    "follow", "ensure", "applicable", "relevant",
    # Financial / reporting terms (generic in many document types)
    "report", "reports", "reporting",
    "quarterly", "annual", "monthly",
    "financial", "cost", "costs",
}
