"""
RAG (Retrieval-Augmented Generation) service for Milestone 3.

Combines document retrieval (FTS5) with visual detection retrieval,
then calls Gemini API to generate a grounded answer.

If GEMINI_API_KEY is not configured, falls back to retrieval-only mode
(same as existing Knowledge Q&A, but multimodal).
"""

import json
import logging
import os
from typing import Optional

from backend.services.fts_service import search as fts_search
from backend.services.visual_retrieval_service import (
    get_violations_by_type,
    get_recent_violations,
    infer_violation_type_from_question,
)

log = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def answer_question(
    question: str,
    user_id: int,
    include_visual: bool = True,
    document_id: Optional[int] = None,
) -> dict:
    """
    Main RAG entry point.
    
    Returns:
    {
        "question": str,
        "answer_type": "llm_grounded" | "retrieval_only" | "no_evidence",
        "answer": str,
        "visual_evidence": [...] | None,
        "document_evidence": [...],
        "sources": [...],
        "llm_used": bool,
    }
    """
    # Step 1: Retrieve document passages
    doc_results = fts_search(query=question, document_id=document_id, limit=5, offset=0)
    passages = doc_results.get("results", [])
    
    # Filter to user's docs (security)
    from backend.models.document_models import Document
    if passages:
        doc_ids = {p["document_id"] for p in passages}
        user_doc_ids = {
            d.id for d in Document.query.filter(
                Document.id.in_(doc_ids),
                Document.user_id == user_id,
            ).all()
        }
        passages = [p for p in passages if p["document_id"] in user_doc_ids]
    
    # Step 2: Retrieve visual evidence (if relevant)
    visual_evidence = []
    if include_visual:
        violation_type = infer_violation_type_from_question(question)
        if violation_type:
            visual_evidence = get_violations_by_type(user_id, violation_type, limit=3)
        else:
            # For general questions, get recent violations
            visual_evidence = get_recent_violations(user_id, limit=3)
    
    # Step 3: Generate answer
    if not passages and not visual_evidence:
        return {
            "question": question,
            "answer_type": "no_evidence",
            "answer": (
                "No relevant information was found in your uploaded documents or detection records "
                "for this question. Please upload relevant safety documents or ensure PPE detection "
                "has been performed before asking investigation questions."
            ),
            "visual_evidence": None,
            "document_evidence": [],
            "sources": [],
            "llm_used": False,
        }
    
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            answer = _call_gemini(question, passages, visual_evidence)
            answer_type = "llm_grounded"
            llm_used = True
        except Exception as exc:
            log.warning("Gemini API call failed: %s — falling back to retrieval-only", exc)
            answer = _retrieval_only_answer(passages, visual_evidence)
            answer_type = "retrieval_only"
            llm_used = False
    else:
        answer = _retrieval_only_answer(passages, visual_evidence)
        answer_type = "retrieval_only"
        llm_used = False
    
    # Step 4: Build source references
    sources = _build_sources(passages, visual_evidence)
    
    return {
        "question": question,
        "answer_type": answer_type,
        "answer": answer,
        "visual_evidence": visual_evidence if visual_evidence else None,
        "document_evidence": passages,
        "sources": sources,
        "llm_used": llm_used,
    }


def _call_gemini(question: str, passages: list, visual_evidence: list) -> str:
    """Call Gemini API with retrieved context."""
    import google.generativeai as genai
    api_key = os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = _build_prompt(question, passages, visual_evidence)
    response = model.generate_content(prompt)
    return response.text


def _build_prompt(question: str, passages: list, visual_evidence: list) -> str:
    """Build a structured prompt for Gemini."""
    lines = [
        "You are a workplace safety investigation assistant.",
        "Answer the question ONLY using the provided evidence.",
        "If the evidence does not support an answer, say so clearly.",
        "Do NOT fabricate safety rules, locations, camera names, or detection results.",
        "Always cite the source document and page number when referencing safety rules.",
        "",
        f"QUESTION: {question}",
        "",
    ]
    
    if visual_evidence:
        lines.append("=== VISUAL DETECTION EVIDENCE ===")
        for i, ve in enumerate(visual_evidence, 1):
            lines.append(f"Detection {i}:")
            lines.append(f"  - Violation: {ve['class_label']}")
            lines.append(f"  - Confidence: {ve['confidence']:.1%}")
            lines.append(f"  - File: {ve['analysis_filename']}")
            lines.append(f"  - Media type: {ve['media_type']}")
            if ve.get("timestamp_seconds") is not None:
                lines.append(f"  - Timestamp: {ve['timestamp_seconds']:.1f}s")
            if ve.get("frame_number") is not None:
                lines.append(f"  - Frame: {ve['frame_number']}")
            lines.append(f"  - Recorded: {ve['created_at'] or 'unknown'}")
        lines.append("")
    
    if passages:
        lines.append("=== DOCUMENT EVIDENCE ===")
        for i, p in enumerate(passages, 1):
            lines.append(f"Passage {i} (from '{p['document_name']}', page {p.get('page_number') or 'N/A'}):")
            section = p.get("section_heading")
            if section:
                lines.append(f"  Section: {section}")
            lines.append(f"  Text: {p.get('text', p.get('snippet', ''))[:600]}")
        lines.append("")
    
    lines += [
        "=== YOUR TASK ===",
        "Based ONLY on the evidence above, provide a concise investigation response that:",
        "1. States what was detected (from visual evidence, if present)",
        "2. Identifies the applicable safety rule (from document evidence, if present)",
        "3. Explains whether this constitutes a potential safety violation",
        "4. Cites your sources (document name + page number)",
        "",
        "If location or camera information is not available in the evidence, do not invent it.",
        "A model detection is a potential violation, not a confirmed incident.",
        "Keep your response under 300 words.",
    ]
    
    return "\n".join(lines)


def _retrieval_only_answer(passages: list, visual_evidence: list) -> str:
    """Generate a structured retrieval-only answer (no LLM)."""
    parts = []
    
    if visual_evidence:
        parts.append("**Visual Detection Evidence**")
        for ve in visual_evidence:
            conf_pct = f"{ve['confidence']:.1%}"
            parts.append(
                f"- Violation detected: **{ve['class_label']}** "
                f"(confidence: {conf_pct}) in file '{ve['analysis_filename']}'"
            )
    
    if passages:
        parts.append("\n**Relevant Safety Document Passages**")
        for p in passages:
            doc = p.get("document_name", "Unknown")
            page = p.get("page_number")
            section = p.get("section_heading")
            text = p.get("text", p.get("snippet", ""))[:400]
            ref = f"p.{page}" if page else "page unknown"
            heading = f" — {section}" if section else ""
            parts.append(f"\n*{doc} ({ref}){heading}:*")
            parts.append(text)
    
    if not parts:
        return "No relevant evidence found in the uploaded documents or detection records."
    
    parts.append(
        "\n---\n*This response shows retrieved passages directly from your documents "
        "and detection records. No AI generation was used. Configure GEMINI_API_KEY "
        "for AI-generated investigation summaries.*"
    )
    return "\n".join(parts)


def _build_sources(passages: list, visual_evidence: list) -> list:
    sources = []
    seen_docs = set()
    for p in passages:
        doc_id = p.get("document_id")
        if doc_id not in seen_docs:
            seen_docs.add(doc_id)
            sources.append({
                "type": "document",
                "document_id": doc_id,
                "document_name": p.get("document_name"),
                "page_number": p.get("page_number"),
                "section_heading": p.get("section_heading"),
            })
    for ve in visual_evidence:
        sources.append({
            "type": "detection",
            "analysis_id": ve.get("analysis_id"),
            "detection_id": ve.get("detection_id"),
            "class_label": ve.get("class_label"),
            "confidence": ve.get("confidence"),
        })
    return sources
