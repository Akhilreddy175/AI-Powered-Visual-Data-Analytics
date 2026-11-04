"""
LangGraph-based investigation workflow for Milestone 3.

Graph: analyze_question → retrieve_visual → retrieve_documents →
       fuse_evidence → generate_answer → log_incident → send_alert → build_response

Conditional routing:
  - Skip retrieve_visual if question is purely document-oriented
  - Skip log_incident if no visual violation found
  - Skip send_alert if no incident was logged
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State definition — plain dict (TypedDict when langgraph is available)
# ---------------------------------------------------------------------------

def _empty_state(question: str, user_id: int, document_id) -> dict:
    return {
        "question": question,
        "user_id": user_id,
        "document_id": document_id,
        # Analysis
        "question_type": "general",
        "inferred_violation": None,
        "needs_visual": True,
        # Evidence
        "visual_evidence": [],
        "document_evidence": [],
        # Answer
        "answer": "",
        "answer_type": "no_evidence",
        "llm_used": False,
        "sources": [],
        # Incident
        "incident_id": None,
        "incident_created": False,
        # Alert
        "alert_status": "skipped",
        "alert_message": "",
        # Tracking
        "steps": [],
        "error": None,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_investigation(question: str, user_id: int, document_id=None) -> dict:
    """Run the full investigation pipeline. Returns the final state dict."""
    state = _empty_state(question, user_id, document_id)

    # Execute nodes sequentially (with conditional routing)
    state = _node_analyze_question(state)

    if state.get("needs_visual"):
        state = _node_retrieve_visual(state)

    state = _node_retrieve_documents(state)
    state = _node_fuse_evidence(state)
    state = _node_generate_answer(state)

    # Only log incident when visual violation is present
    if state.get("visual_evidence") and state.get("question_type") in ("investigation", "general"):
        state = _node_log_incident(state)
        if state.get("incident_created"):
            state = _node_send_alert(state)

    state = _node_build_response(state)
    return state


# ---------------------------------------------------------------------------
# Node: Analyze Question
# ---------------------------------------------------------------------------

def _node_analyze_question(state: dict) -> dict:
    question = state["question"].lower()

    visual_keywords = [
        "violation", "detected", "detection", "camera", "worker", "helmet",
        "hardhat", "vest", "gloves", "goggles", "ppe", "wearing", "alert",
        "incident", "zone", "morning", "today", "yesterday", "why was",
    ]
    doc_keywords = [
        "policy", "rule", "requirement", "procedure", "regulation", "guideline",
        "manual", "document", "section", "standard", "what does the", "according to",
    ]

    visual_score = sum(1 for kw in visual_keywords if kw in question)
    doc_score    = sum(1 for kw in doc_keywords    if kw in question)

    if visual_score >= 2 or any(kw in question for kw in ["why was", "violation", "incident"]):
        q_type       = "investigation"
        needs_visual = True
    elif doc_score > visual_score:
        q_type       = "document_only"
        needs_visual = False
    else:
        q_type       = "general"
        needs_visual = True

    from backend.services.visual_retrieval_service import infer_violation_type_from_question
    inferred = infer_violation_type_from_question(state["question"])

    step = {
        "name":   "Question Analysis",
        "status": "completed",
        "detail": f"Type: {q_type}, needs visual: {needs_visual}" +
                  (f", inferred violation: {inferred}" if inferred else ""),
    }
    return {**state, "question_type": q_type, "needs_visual": needs_visual,
            "inferred_violation": inferred, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Retrieve Visual Evidence
# ---------------------------------------------------------------------------

def _node_retrieve_visual(state: dict) -> dict:
    from backend.services.visual_retrieval_service import (
        get_violations_by_type, get_recent_violations,
    )
    user_id = state["user_id"]
    vtype   = state.get("inferred_violation")

    try:
        evidence = (
            get_violations_by_type(user_id, vtype, limit=3) if vtype
            else get_recent_violations(user_id, limit=3)
        )
    except Exception as exc:
        log.warning("Visual retrieval failed: %s", exc)
        evidence = []

    step = {
        "name":   "Visual Evidence Retrieval",
        "status": "completed" if evidence else "no_results",
        "detail": f"Found {len(evidence)} detection(s)" + (f" for '{vtype}'" if vtype else ""),
    }
    return {**state, "visual_evidence": evidence, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Retrieve Documents
# ---------------------------------------------------------------------------

def _node_retrieve_documents(state: dict) -> dict:
    from backend.services.fts_service import search as fts_search
    from backend.models.document_models import Document

    try:
        raw      = fts_search(query=state["question"], document_id=state.get("document_id"), limit=5)
        passages = raw.get("results", [])

        if passages:
            doc_ids      = {p["document_id"] for p in passages}
            user_doc_ids = {
                d.id for d in Document.query.filter(
                    Document.id.in_(doc_ids),
                    Document.user_id == state["user_id"],
                ).all()
            }
            passages = [p for p in passages if p["document_id"] in user_doc_ids]
    except Exception as exc:
        log.warning("Document retrieval failed: %s", exc)
        passages = []

    step = {
        "name":   "Document Retrieval",
        "status": "completed" if passages else "no_results",
        "detail": f"Found {len(passages)} relevant passage(s)",
    }
    return {**state, "document_evidence": passages, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Fuse Evidence
# ---------------------------------------------------------------------------

def _node_fuse_evidence(state: dict) -> dict:
    visual = state.get("visual_evidence", [])
    docs   = state.get("document_evidence", [])

    step = {
        "name":   "Evidence Fusion",
        "status": "completed" if (visual or docs) else "no_evidence",
        "detail": f"Visual: {len(visual)} detection(s), Documents: {len(docs)} passage(s)",
    }
    return {**state, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Generate Answer
# ---------------------------------------------------------------------------

def _node_generate_answer(state: dict) -> dict:
    visual  = state.get("visual_evidence", [])
    docs    = state.get("document_evidence", [])
    question = state["question"]

    if not visual and not docs:
        step = {"name": "Investigation Generation", "status": "no_evidence",
                "detail": "No evidence available"}
        return {**state,
                "answer": ("No relevant information was found in your uploaded documents or "
                           "detection records for this question."),
                "answer_type": "no_evidence", "llm_used": False, "sources": [],
                "steps": state["steps"] + [step]}

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            from backend.services.rag_service import _call_gemini, _build_sources
            answer_text  = _call_gemini(question, docs, visual)
            answer_type  = "llm_grounded"
            llm_used     = True
        except Exception as exc:
            log.warning("Gemini failed in workflow: %s", exc)
            from backend.services.rag_service import _retrieval_only_answer, _build_sources
            answer_text  = _retrieval_only_answer(docs, visual)
            answer_type  = "retrieval_only"
            llm_used     = False
    else:
        from backend.services.rag_service import _retrieval_only_answer, _build_sources
        answer_text  = _retrieval_only_answer(docs, visual)
        answer_type  = "retrieval_only"
        llm_used     = False

    from backend.services.rag_service import _build_sources
    sources = _build_sources(docs, visual)

    step = {
        "name":   "Investigation Generation",
        "status": "completed",
        "detail": f"Answer type: {answer_type}, LLM used: {llm_used}",
    }
    return {**state, "answer": answer_text, "answer_type": answer_type,
            "llm_used": llm_used, "sources": sources, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Log Incident
# ---------------------------------------------------------------------------

def _node_log_incident(state: dict) -> dict:
    from backend.extensions import db
    from backend.models.incident_models import Incident
    from datetime import timedelta

    try:
        visual  = state.get("visual_evidence", [])
        docs    = state.get("document_evidence", [])
        top_det = visual[0] if visual else None
        top_doc = docs[0]   if docs   else None

        # Duplicate check: same user + violation type + same analysis within last hour
        if top_det:
            cutoff   = datetime.now(timezone.utc) - timedelta(hours=1)
            existing = Incident.query.filter(
                Incident.user_id     == state["user_id"],
                Incident.violation_type == top_det.get("class_label"),
                Incident.analysis_id == top_det.get("analysis_id"),
                Incident.created_at  >= cutoff,
            ).first()
            if existing:
                step = {"name": "Incident Logging", "status": "skipped",
                        "detail": f"Duplicate — incident #{existing.id} already exists"}
                return {**state, "incident_id": existing.id, "incident_created": False,
                        "steps": state["steps"] + [step]}

        incident = Incident(
            user_id               = state["user_id"],
            violation_type        = top_det.get("class_label") if top_det else None,
            analysis_id           = top_det.get("analysis_id") if top_det else None,
            detection_id          = top_det.get("detection_id") if top_det else None,
            confidence            = top_det.get("confidence") if top_det else None,
            document_id           = top_doc.get("document_id") if top_doc else None,
            chunk_id              = top_doc.get("chunk_id") if top_doc else None,
            question              = state.get("question"),
            investigation_summary = state.get("answer"),
            visual_evidence_json  = json.dumps(visual) if visual else None,
            document_evidence_json= json.dumps(docs)   if docs   else None,
            workflow_steps_json   = json.dumps(state.get("steps", [])),
            status                = "logged",
            alert_status          = "pending",
        )
        db.session.add(incident)
        db.session.commit()

        step = {"name": "Incident Logging", "status": "completed",
                "detail": f"Incident #{incident.id} created"}
        return {**state, "incident_id": incident.id, "incident_created": True,
                "steps": state["steps"] + [step]}

    except Exception as exc:
        log.exception("Failed to log incident")
        step = {"name": "Incident Logging", "status": "failed", "detail": str(exc)}
        return {**state, "incident_created": False, "steps": state["steps"] + [step]}


# ---------------------------------------------------------------------------
# Node: Send Alert
# ---------------------------------------------------------------------------

def _node_send_alert(state: dict) -> dict:
    incident_id = state.get("incident_id")
    if not incident_id:
        step = {"name": "Supervisor Alert", "status": "skipped", "detail": "No incident to alert on"}
        return {**state, "alert_status": "skipped", "steps": state["steps"] + [step]}

    try:
        from backend.extensions import db
        from backend.models.incident_models import Incident

        incident  = Incident.query.get(incident_id)
        smtp_host = os.environ.get("SMTP_HOST", "")
        alert_msg = (
            f"[SafeVision AI Alert] Potential PPE violation detected: "
            f"{incident.violation_type or 'Unknown violation'} "
            f"(Incident #{incident_id}). Please review."
        )

        if smtp_host:
            _send_email_alert(alert_msg, incident)
            alert_status = "sent"
        else:
            alert_status = "dev_mode"
            alert_msg += (" [DEV MODE: Email not configured. "
                          "Set SMTP_HOST, SMTP_USER, SMTP_PASS, SUPERVISOR_EMAIL to enable.]")

        incident.alert_status  = alert_status
        incident.alert_message = alert_msg
        db.session.commit()

        step = {"name": "Supervisor Alert", "status": alert_status,
                "detail": "Email configured: " + ("yes" if smtp_host else "no (dev mode)")}
        return {**state, "alert_status": alert_status, "alert_message": alert_msg,
                "steps": state["steps"] + [step]}

    except Exception as exc:
        log.exception("Alert failed")
        step = {"name": "Supervisor Alert", "status": "failed", "detail": str(exc)}
        return {**state, "alert_status": "failed", "steps": state["steps"] + [step]}


def _send_email_alert(message: str, incident) -> None:
    import smtplib
    from email.mime.text import MIMEText
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    alert_to  = os.environ.get("SUPERVISOR_EMAIL", smtp_user)

    msg = MIMEText(message)
    msg["Subject"] = f"SafeVision Alert: PPE Violation Incident #{incident.id}"
    msg["From"]    = smtp_user
    msg["To"]      = alert_to

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        if smtp_user:
            server.login(smtp_user, smtp_pass)
        server.send_message(msg)


# ---------------------------------------------------------------------------
# Node: Build Response
# ---------------------------------------------------------------------------

def _node_build_response(state: dict) -> dict:
    step = {
        "name":   "Response Built",
        "status": "completed",
        "detail": f"Incident logged: {state.get('incident_created', False)}, "
                  f"Alert: {state.get('alert_status', 'skipped')}",
    }
    all_steps = state["steps"] + [step]

    # Persist final steps to incident record
    incident_id = state.get("incident_id")
    if incident_id and state.get("incident_created"):
        try:
            from backend.extensions import db
            from backend.models.incident_models import Incident
            inc = Incident.query.get(incident_id)
            if inc:
                inc.workflow_steps_json = json.dumps(all_steps)
                db.session.commit()
        except Exception:
            pass

    return {**state, "steps": all_steps}
