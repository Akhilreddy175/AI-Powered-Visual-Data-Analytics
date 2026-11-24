"""
RAG (Retrieval-Augmented Generation) service — Milestone 3.

Quick Answer:
  - Document-based question answering only.
  - No visual detection retrieval.
  - No incident logging.
  - Retrieves relevant passages from the user's uploaded documents.
  - Generates a natural-language answer with Gemini when available.
  - Falls back to a structured summary from the retrieved passages when Gemini
    is not configured, without exposing raw DB records.

Full Investigation:
  - Handled entirely by langgraph_service.py.
  - _classify_intent, _build_doc_query, _retrieve_user_passages,
    _call_gemini, _retrieval_only_answer and _build_sources are
    imported by langgraph_service for shared logic.
"""

import logging
import os
import re
from typing import Optional

from backend.services.fts_service import search as fts_search, _extract_terms

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intent classification  (shared with langgraph_service)
# ---------------------------------------------------------------------------

_VISUAL_SIGNALS = {
    "violation", "violations", "violated", "detected", "detection", "detections",
    "alert", "alerts", "incident", "incidents", "camera", "wearing", "worn",
    "worker", "workers", "caught", "identified", "flagged", "triggered",
}

_DOC_SIGNALS = {
    "policy", "policies", "rule", "rules", "requirement", "requirements",
    "procedure", "procedures", "regulation", "regulations", "guideline",
    "guidelines", "manual", "manuals", "document", "documents", "standard",
    "standards", "section", "chapter", "clause", "protocol", "code",
    "according", "states", "says", "mention", "define", "definition",
    "mandatory", "required", "compulsory", "obligatory",
}


def _classify_intent(question: str) -> dict:
    """
    Classify the user's question intent.
    Returns: {needs_visual, needs_docs, inferred_violation}
    Used by langgraph_service for Full Investigation intent analysis.
    """
    from backend.services.visual_retrieval_service import infer_violation_type_from_question

    q = question.lower()
    words = set(re.findall(r"\w+", q))

    visual_score = len(words & _VISUAL_SIGNALS)
    doc_score    = len(words & _DOC_SIGNALS)

    inferred_violation = infer_violation_type_from_question(question)

    if inferred_violation:
        needs_visual = True
        needs_docs   = True
    elif visual_score > 0 and visual_score >= doc_score:
        needs_visual = True
        needs_docs   = True
    elif doc_score > 0:
        needs_visual = False
        needs_docs   = True
    else:
        needs_visual = False
        needs_docs   = True

    return {
        "needs_visual":       needs_visual,
        "needs_docs":         needs_docs,
        "inferred_violation": inferred_violation,
    }


# ---------------------------------------------------------------------------
# Violation concept map  (shared with langgraph_service)
# ---------------------------------------------------------------------------

_VIOLATION_CONCEPT = {
    "no-hardhat":     ["hardhat", "helmet", "head protection"],
    "no-safety vest": ["safety vest", "reflective vest", "high visibility"],
    "no-gloves":      ["gloves", "hand protection"],
    "no-goggles":     ["goggles", "eye protection", "safety glasses"],
    "no-mask":        ["mask", "respirator", "face protection"],
    "no-boots":       ["safety boots", "foot protection"],
    "no-earmuffs":    ["earmuffs", "hearing protection"],
}


def _build_doc_query(question: str, inferred_violation: Optional[str]) -> str:
    """
    Build a focused document retrieval query.
    Used by both rag_service (Quick Answer) and langgraph_service (Full Investigation).
    """
    if inferred_violation:
        concepts = _VIOLATION_CONCEPT.get(inferred_violation.lower(), [])
        if concepts:
            primary  = concepts[0]
            fallback = "Personal Protective Equipment"
            return f"{primary} {fallback}"
    return question


# ---------------------------------------------------------------------------
# Chunk quality filter
# ---------------------------------------------------------------------------

def _is_quality_chunk(p: dict) -> bool:
    """Return False for chunks that are noise: too short, blank pages, tabular."""
    text = p.get("text", "").strip()
    if len(text) < 80:
        return False
    if "intentionally blank" in text.lower():
        return False
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) >= 5:
        avg_len = sum(len(ln) for ln in lines) / len(lines)
        if avg_len < 30:
            return False
    return True


# ---------------------------------------------------------------------------
# Post-retrieval relevance validation
# ---------------------------------------------------------------------------

# Terms ubiquitous in safety/technical documents that carry almost no
# discriminative power for relevance scoring.  A passage that only matches
# question words from this set is unlikely to be topically relevant.
#
# Intentionally does NOT include domain-specific or out-of-domain terms
# (e.g. "quarterly", "financial", "circuits") — those ARE discriminating
# and should be used to filter out irrelevant passages.
_GENERIC_PASSAGE_TERMS = {
    # Safety domain universals — appear in almost every safety doc passage
    "safety", "safe",
    "work", "working", "worked", "worker", "workers", "workplace",
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
    "general", "specific",
    "follow", "ensure", "applicable", "relevant",
    "document", "documents",
    "information", "measure", "measures",
    # Common question-word remnants not caught by stop-word filter
    "after", "before", "during", "within", "without",
}


def _specific_question_terms(question: str) -> list:
    """
    Extract the subject-specific terms from a question — the words that
    identify WHAT the user is asking about.

    Removes stop words (via _extract_terms) then further removes terms
    from the domain-generic safety vocabulary above.  The remaining terms
    are the discriminating subjects of the question.

    If all terms are generic (broad question), returns an empty list,
    which signals that relevance filtering should be skipped.
    """
    all_terms = _extract_terms(question)
    specific   = [t for t in all_terms if t.lower() not in _GENERIC_PASSAGE_TERMS]
    return specific


def _term_matches(term: str, text_lower: str) -> bool:
    """
    Return True if the term (or a 6-char stem of it for words ≥ 8 chars)
    appears as a word in the text.  The stem check handles common
    inflections (plural, past tense, gerund) without needing a stemmer.
    """
    if re.search(r"\b" + re.escape(term.lower()) + r"\b", text_lower):
        return True
    # Prefix / stem match for longer words
    if len(term) >= 8:
        stem = term[:6].lower()
        if re.search(r"\b" + re.escape(stem), text_lower):
            return True
    return False


def _relevance_score(passage: dict, specific_terms: list) -> float:
    """
    Fraction of the question's specific terms that appear in the passage.
    Returns 0.0–1.0.  Returns 1.0 (pass-all) when specific_terms is empty.
    """
    if not specific_terms:
        return 1.0
    text = passage.get("text", passage.get("snippet", ""))
    text = re.sub(r"<[^>]+>", "", text).lower()
    matches = sum(1 for t in specific_terms if _term_matches(t, text))
    return matches / len(specific_terms)


def _filter_relevant_passages(passages: list, question: str) -> list:
    """
    Reject passages that do not address the specific subject of the question.

    Algorithm:
      1. Extract the question's subject-specific terms (non-generic content words).
      2. Score each passage by the fraction of those terms it contains.
      3. Apply a minimum score threshold that scales with query specificity:
           - 1 specific term  → score must be 1.0  (the term must appear)
           - 2 specific terms → score must be >= 0.5 (at least 1 of 2)
           - 3+ specific terms → score must be >= 0.4 (prevents single-word
             incidental matches from passing multi-subject queries)
      4. If no specific terms can be extracted, return all passages unchanged.
      5. Sort survivors by descending score so the most relevant lead.
    """
    specific_terms = _specific_question_terms(question)

    if not specific_terms:
        log.debug("No specific terms extracted from question; skipping relevance filter.")
        return passages

    n = len(specific_terms)
    if n == 1:
        min_score = 1.0
    elif n == 2:
        min_score = 0.5
    else:
        # For 3+ specific terms: require at least 1 to match (lenient).
        # The individual-term fallback fix already prevents OOD queries from
        # surfacing unrelated passages, so we don't need a harsh threshold here.
        min_score = 1.0 / n

    scored = []
    for p in passages:
        score = _relevance_score(p, specific_terms)
        if score >= min_score:
            scored.append((score, p))

    if not scored:
        log.debug(
            "Relevance filter: all %d passage(s) rejected (specific terms: %s, min=%.2f).",
            len(passages), specific_terms, min_score,
        )
        return []

    scored.sort(key=lambda x: -x[0])
    log.debug(
        "Relevance filter: %d/%d passage(s) kept (specific terms: %s, min=%.2f).",
        len(scored), len(passages), specific_terms, min_score,
    )
    return [p for _, p in scored]


# ---------------------------------------------------------------------------
# User-scoped retrieval with progressive fallback
# Used by both rag_service and langgraph_service.
# ---------------------------------------------------------------------------

def _retrieve_user_passages(
    query: str,
    user_id: int,
    document_id: Optional[int] = None,
    top_k: int = 5,
) -> list:
    """
    Retrieve document passages from FTS, filtered to documents owned by user_id.
    Fetches 60 results to avoid other-user docs exhausting the FTS LIMIT.
    Fallback chain: full query → term pairs → individual terms.
    """
    from backend.models.document_models import Document

    if document_id:
        user_doc_ids = {
            d.id for d in Document.query.filter(
                Document.id == document_id,
                Document.user_id == user_id,
            ).all()
        }
    else:
        user_doc_ids = {
            d.id for d in Document.query.filter(
                Document.user_id == user_id,
                Document.status.in_(["completed", "partial"]),
            ).all()
        }

    if not user_doc_ids:
        return []

    def _run(q: str, limit: int = 60) -> list:
        raw = fts_search(query=q, document_id=document_id, limit=limit, offset=0)
        return [
            p for p in raw.get("results", [])
            if p["document_id"] in user_doc_ids and _is_quality_chunk(p)
        ]

    def _dedup(passages: list) -> list:
        seen, result = set(), []
        for p in passages:
            if p["chunk_id"] not in seen:
                seen.add(p["chunk_id"])
                result.append(p)
        return result

    passages = _run(query)
    if passages:
        return _dedup(passages)[:top_k]

    # Import the generic-term list to avoid using over-common terms as fallback
    # search targets (they produce too many irrelevant matches).
    from backend.services.fts_service import _GENERIC_FTS_TERMS as _generic

    terms = _extract_terms(query)

    # Pair-based AND fallback: build two-term AND queries from the most specific terms.
    # Only use non-generic terms for pairing. If ALL terms are generic (e.g. an
    # out-of-domain question like "quarterly financial report") skip pairing entirely —
    # pairing generic terms produces noisy results from unrelated documents.
    if len(terms) >= 2:
        specific = [t for t in terms if t.lower() not in _generic]
        if specific:
            # Need at least two terms to form a pair; if only one specific term,
            # supplement with the longest non-generic term available, else use that term alone.
            pair_pool = specific if len(specific) >= 2 else specific
            ranked_terms = sorted(pair_pool, key=len, reverse=True)
            all_found = []
            for i in range(min(3, len(ranked_terms))):
                for j in range(i + 1, min(4, len(ranked_terms))):
                    all_found.extend(_run(f"{ranked_terms[i]} {ranked_terms[j]}"))
            passages = _dedup(all_found)
            if passages:
                return passages[:top_k]

    # Individual-term fallback: only use terms that are specific enough to be
    # meaningful search targets on their own.
    if terms:
        specific_terms = [t for t in terms if t.lower() not in _generic]
        fallback_terms = specific_terms if specific_terms else terms
        ranked_terms = sorted(fallback_terms, key=len, reverse=True)
        all_found = []
        for term in ranked_terms[:4]:
            all_found.extend(_run(term, limit=20))
        passages = _dedup(all_found)
        if passages:
            return passages[:top_k]

    return []


# ---------------------------------------------------------------------------
# Quick Answer — main entry point
# ---------------------------------------------------------------------------

def answer_question(
    question: str,
    user_id: int,
    include_visual: bool = False,   # Quick Answer never uses visual
    document_id: Optional[int] = None,
) -> dict:
    """
    Document-based question answering for Quick Answer mode.

    Flow:
      1. Retrieve relevant passages from the user's indexed documents only.
      2. If Gemini is configured, generate a natural-language answer.
      3. If Gemini is not configured, synthesise a readable answer from passages.
      4. Return the answer with source references.

    Visual detection records are NEVER retrieved or displayed in Quick Answer.
    """
    # Retrieve candidate passages from FTS (document-only, no visual)
    doc_query = _build_doc_query(question, None)
    try:
        # Fetch more candidates than needed so the relevance filter has enough to work with
        passages = _retrieve_user_passages(doc_query, user_id, document_id, top_k=10)
    except Exception as exc:
        log.warning("Document retrieval failed: %s", exc)
        passages = []

    # Validate relevance: reject passages that do not address the question's subject
    passages = _filter_relevant_passages(passages, question)

    # Cap at 5 after filtering (most relevant first from filter's sort)
    passages = passages[:5]

    if not passages:
        return {
            "question": question,
            "answer": (
                "I couldn't find sufficient information about this topic in your "
                "uploaded documents. Please upload a relevant safety document or "
                "try another question."
            ),
            "sources":  [],
            "llm_used": False,
        }

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key:
        try:
            answer   = _call_gemini_qa(question, passages)
            llm_used = True
        except Exception as exc:
            log.warning("Gemini call failed (%s) — using passage-based answer.", exc)
            answer   = _build_passage_answer(question, passages)
            llm_used = False
    else:
        answer   = _build_passage_answer(question, passages)
        llm_used = False

    sources = _build_sources(passages, [])

    return {
        "question": question,
        "answer":   answer,
        "sources":  sources,
        "llm_used": llm_used,
    }


# ---------------------------------------------------------------------------
# Gemini calls
# ---------------------------------------------------------------------------

def _call_gemini_qa(question: str, passages: list) -> str:
    """Call Gemini for Quick Answer mode (documents only, no visual)."""
    import google.generativeai as genai
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    genai.configure(api_key=api_key)
    model    = genai.GenerativeModel("gemini-1.5-flash")
    prompt   = _build_gemini_prompt_qa(question, passages)
    response = model.generate_content(prompt)
    return response.text


def _build_gemini_prompt_qa(question: str, passages: list) -> str:
    """Grounding prompt for Quick Answer (document-only)."""
    lines = [
        "You are a workplace safety assistant. Answer the user's question using ONLY "
        "the document passages provided below.",
        "Do NOT fabricate safety rules, standards, or document content.",
        "If the passages do not contain enough information, say so clearly.",
        "Write a concise, direct answer. Use bullet points for lists of requirements "
        "or steps. End with a 'Sources:' section listing document name and page number.",
        "",
        f"Question: {question}",
        "",
        "--- Retrieved document passages ---",
    ]
    for i, p in enumerate(passages, 1):
        doc  = p.get("document_name", "Unknown document")
        page = p.get("page_number")
        sec  = p.get("section_heading", "")
        text = p.get("text", p.get("snippet", ""))[:600]
        ref  = f"p. {page}" if page else ""
        heading = f" | {sec}" if sec else ""
        lines.append(f"\n[{i}] {doc} {ref}{heading}")
        lines.append(text)
    lines += [
        "",
        "--- End of passages ---",
        "",
        "Now answer the question using only the passages above.",
    ]
    return "\n".join(lines)


# Keep the old _call_gemini signature for langgraph_service compatibility.
# langgraph calls: _call_gemini(question, docs, visual_evidence)
def _call_gemini(question: str, passages: list, visual_evidence: list = None) -> str:
    """
    Gemini call for Full Investigation mode (called by langgraph_service).
    Includes both document passages and visual detections in the prompt.
    """
    import google.generativeai as genai
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    genai.configure(api_key=api_key)
    model    = genai.GenerativeModel("gemini-1.5-flash")
    prompt   = _build_investigation_prompt(question, passages, visual_evidence or [])
    response = model.generate_content(prompt)
    return response.text


def _build_investigation_prompt(question: str, passages: list, visual_evidence: list) -> str:
    """Grounding prompt for Full Investigation (documents + visual detections)."""
    lines = [
        "You are a workplace safety assistant. Answer using ONLY the evidence below.",
        "Do NOT fabricate safety rules, locations, detection results, or document content.",
        "If the evidence is insufficient, say so explicitly.",
        "Cite the source document and page number for every safety rule you reference.",
        "",
        f"QUESTION: {question}",
        "",
    ]

    if visual_evidence:
        lines.append("=== VISUAL DETECTION EVIDENCE ===")
        for i, ve in enumerate(visual_evidence, 1):
            lines.append(f"Detection {i}:")
            lines.append(f"  Violation: {ve['class_label']}")
            lines.append(f"  Confidence: {ve['confidence']:.1%}")
            lines.append(f"  File: {ve['analysis_filename']} ({ve['media_type']})")
            if ve.get("timestamp_seconds") is not None:
                lines.append(f"  Timestamp: {ve['timestamp_seconds']:.1f}s")
            lines.append(f"  Recorded: {ve.get('created_at') or 'unknown'}")
        lines.append("")

    if passages:
        lines.append("=== DOCUMENT EVIDENCE ===")
        for i, p in enumerate(passages, 1):
            pg  = p.get("page_number") or "N/A"
            sec = p.get("section_heading")
            lines.append(f"Passage {i} ({p['document_name']}, page {pg}):")
            if sec:
                lines.append(f"  Section: {sec}")
            lines.append(f"  {p.get('text', p.get('snippet', ''))[:600]}")
        lines.append("")

    lines += [
        "=== INSTRUCTIONS ===",
        "Write a concise, direct answer (under 250 words) that:",
        "1. Directly answers the question.",
        "2. States relevant detected violations (from visual evidence, if present).",
        "3. States the applicable safety rules (from document evidence, if present).",
        "4. Cites sources: document name and page number.",
        "5. Flags any gap where the evidence does not fully support an answer.",
        "",
        "Do not invent locations, camera names, or worker identities.",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Passage-based answer (no LLM) — used by Quick Answer when Gemini unavailable
# ---------------------------------------------------------------------------

def _build_passage_answer(question: str, passages: list) -> str:
    """
    Synthesise a readable answer from retrieved passages when Gemini is not available.
    Produces a natural, human-readable response rather than a raw data dump.
    """
    snippets = []
    for p in passages:
        text = p.get("text", p.get("snippet", "")).strip()
        # Strip HTML markup (FTS highlights use <mark> tags)
        text = re.sub(r"<[^>]+>", "", text)
        # Collapse internal newlines into spaces so the text is a single paragraph
        text = re.sub(r"\n+", " ", text)
        text = re.sub(r"\s*\.\.\.\s*", " … ", text)
        # Collapse multiple spaces
        text = re.sub(r" {2,}", " ", text).strip()
        if len(text) > 40:
            snippets.append(text)

    if not snippets:
        return (
            "I couldn't find sufficient information about this topic in your "
            "uploaded documents. Please upload a relevant safety document or "
            "try another question."
        )

    # Extract meaningful sentences as bullet points.
    # Split on sentence-ending punctuation followed by a space.
    bullet_texts = []
    seen = set()
    for snippet in snippets[:3]:
        sentences = re.split(r"(?<=[.!?])\s+", snippet)
        for sent in sentences:
            sent = sent.strip().strip("•–-()").strip()
            # Must be long enough and contain at least one letter
            if len(sent) < 40 or not re.search(r"[a-zA-Z]{3,}", sent):
                continue
            # Skip lines that look like form fields / table headers
            if re.search(r"\b(tick|checkbox|√|Done|Reqd)\b", sent, re.I):
                continue
            norm = sent.lower()[:60]
            if norm in seen:
                continue
            seen.add(norm)
            bullet_texts.append(sent)
            if len(bullet_texts) >= 6:
                break
        if len(bullet_texts) >= 6:
            break

    parts = [
        "Based on your uploaded safety documents, here is the relevant information:\n"
    ]

    if bullet_texts:
        for bt in bullet_texts:
            bt = bt[0].upper() + bt[1:] if bt else bt
            if bt and bt[-1] not in ".!?":
                bt += "."
            parts.append(f"- {bt}")
    else:
        # Fallback: show a clean excerpt from the best passage
        excerpt = snippets[0][:400]
        if len(excerpt) == 400:
            excerpt = excerpt.rsplit(" ", 1)[0] + "…"
        parts.append(excerpt)

    parts.append("\n**Sources:**")
    seen_sources: set = set()
    for p in passages:
        doc  = p.get("document_name", "Unknown document")
        page = p.get("page_number")
        key  = (doc, page)
        if key in seen_sources:
            continue
        seen_sources.add(key)
        ref = f" – Page {page}" if page else ""
        parts.append(f"- {doc}{ref}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Retrieval-only answer — used by langgraph_service (Full Investigation fallback)
# langgraph calls: _retrieval_only_answer(question, passages, visual_evidence)
# ---------------------------------------------------------------------------

def _retrieval_only_answer(question: str, passages: list, visual_evidence: list) -> str:
    """
    Structured fallback answer for Full Investigation when Gemini is unavailable.
    Shows both visual detections and document passages.
    """
    parts = []

    if visual_evidence:
        parts.append("**Detected PPE Violations**\n")
        for ve in visual_evidence:
            conf = f"{ve['confidence']:.1%}"
            ts = ""
            if ve.get("timestamp_seconds") is not None:
                ts = f" at {ve['timestamp_seconds']:.1f}s"
            fn = f" (frame {ve['frame_number']})" if ve.get("frame_number") else ""
            parts.append(
                f"- **{ve['class_label']}** — confidence {conf}, "
                f"file: *{ve['analysis_filename']}*{ts}{fn}"
            )

    if passages:
        parts.append("\n**Relevant Safety Document Passages**\n")
        for p in passages:
            doc  = p.get("document_name", "Unknown document")
            page = p.get("page_number")
            sec  = p.get("section_heading")
            text = p.get("text", p.get("snippet", ""))[:400]
            ref  = f"p. {page}" if page else "page unknown"
            heading = f" — *{sec}*" if sec else ""
            parts.append(f"**{doc}** ({ref}){heading}\n> {text}\n")

    if not parts:
        return "No relevant evidence found in the uploaded documents or detection records."

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Source references  (shared with langgraph_service)
# langgraph calls: _build_sources(docs, visual)
# ---------------------------------------------------------------------------

def _build_sources(passages: list, visual_evidence: list = None) -> list:
    sources = []
    seen_docs = set()
    for p in passages:
        doc_id = p.get("document_id")
        page   = p.get("page_number")
        key    = (doc_id, page)
        if key not in seen_docs:
            seen_docs.add(key)
            sources.append({
                "type":            "document",
                "document_id":     doc_id,
                "document_name":   p.get("document_name"),
                "page_number":     page,
                "section_heading": p.get("section_heading"),
            })
    for ve in (visual_evidence or []):
        sources.append({
            "type":         "detection",
            "analysis_id":  ve.get("analysis_id"),
            "detection_id": ve.get("detection_id"),
            "class_label":  ve.get("class_label"),
            "confidence":   ve.get("confidence"),
        })
    return sources
