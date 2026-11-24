"""
RAG and LangGraph investigation routes — Milestone 3.

Endpoints:
  POST /api/rag/ask        — document-based Quick Answer (no visual detection)
  POST /api/investigate    — full investigation workflow (incident logging + alert)
  GET  /api/rag/detections — visual detection summary for the current user
"""

from flask import Blueprint, jsonify, request
from backend.services.auth_service import login_required

rag_bp = Blueprint("rag", __name__)


@rag_bp.route("/api/rag/ask", methods=["POST"])
@login_required
def rag_ask(current_user):
    """
    Document-based Quick Answer.
    Retrieves relevant passages from the user's uploaded documents and
    generates a natural-language answer. Never retrieves visual detections.
    """
    body     = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "Please provide a question."}), 400
    if len(question) > 1000:
        return jsonify({"error": "Question too long (max 1000 chars)."}), 400

    document_id = body.get("document_id")

    from backend.services.rag_service import answer_question
    result = answer_question(
        question    = question,
        user_id     = current_user.id,
        document_id = document_id,
    )
    return jsonify(result), 200


@rag_bp.route("/api/investigate", methods=["POST"])
@login_required
def run_investigation(current_user):
    """Run full LangGraph investigation workflow with incident logging and alert."""
    body     = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "Please provide a question."}), 400
    if len(question) > 1000:
        return jsonify({"error": "Question too long (max 1000 chars)."}), 400

    document_id = body.get("document_id")

    from backend.services.langgraph_service import run_investigation as run_graph
    result = run_graph(
        question    = question,
        user_id     = current_user.id,
        document_id = document_id,
    )
    return jsonify(result), 200


@rag_bp.route("/api/rag/detections", methods=["GET"])
@login_required
def get_detection_summary(current_user):
    """Get visual detection summary (recent analyses + violations) for current user."""
    from backend.services.visual_retrieval_service import get_all_recent_analyses
    analyses = get_all_recent_analyses(current_user.id, limit=5)
    return jsonify({"analyses": analyses}), 200
