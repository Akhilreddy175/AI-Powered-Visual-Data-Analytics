"""
Search and knowledge base routes.

Endpoints:
  GET  /api/search             — full-text search across indexed documents
  POST /api/knowledge/ask      — retrieval-based question answering (no LLM)
"""

from flask import Blueprint, jsonify, request

from backend.services.auth_service import login_required
from backend.services.fts_service import search as fts_search
from backend.models.document_models import Document

search_bp = Blueprint("search", __name__)


@search_bp.route("/api/search", methods=["GET"])
@login_required
def search_documents(current_user):
    """Search the document knowledge base.

    Query params:
      q           — search query (required)
      document_id — restrict to one document
      file_type   — filter by pdf | docx | txt
      limit       — max results (default 20, max 100)
      offset      — pagination
    """
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({
            "results": [],
            "total":   0,
            "query":   "",
            "message": "Please enter a search query.",
        }), 200

    if len(query) > 500:
        return jsonify({"error": "Query too long (max 500 characters)."}), 400

    document_id = request.args.get("document_id", type=int)
    file_type   = request.args.get("file_type")
    limit       = min(int(request.args.get("limit",  20)), 100)
    offset      = int(request.args.get("offset", 0))

    # Validate document_id belongs to current user
    if document_id is not None:
        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if not doc:
            return jsonify({"error": "Document not found."}), 404

    # Fetch with extra headroom for user filtering
    fetch_limit = limit * 4
    results_data = fts_search(
        query       = query,
        document_id = document_id,
        file_type   = file_type,
        limit       = fetch_limit,
        offset      = 0,
    )

    all_results = results_data.get("results", [])

    # Filter to only the current user's documents (security + correctness)
    if all_results:
        doc_ids = {r["document_id"] for r in all_results}
        user_doc_ids = {
            d.id for d in Document.query.filter(
                Document.id.in_(doc_ids),
                Document.user_id == current_user.id,
            ).all()
        }
        filtered = [r for r in all_results if r["document_id"] in user_doc_ids]
    else:
        filtered = []

    total     = len(filtered)
    paginated = filtered[offset : offset + limit]

    return jsonify({
        "results": paginated,
        "total":   total,
        "query":   query,
    }), 200


@search_bp.route("/api/knowledge/ask", methods=["POST"])
@login_required
def ask_question(current_user):
    """Answer a question by retrieving the most relevant document passages.

    This endpoint performs retrieval-only (no LLM). It returns the top matching
    passages from the FTS5 index so the user can read the actual source text.

    Body (JSON):
      { "question": "...", "document_id": 5 }  ← document_id is optional
    """
    body     = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "Please provide a question."}), 400

    if len(question) > 500:
        return jsonify({"error": "Question too long (max 500 characters)."}), 400

    document_id = body.get("document_id", None)

    # Validate document_id belongs to current user if provided
    if document_id is not None:
        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if not doc:
            return jsonify({"error": "Document not found."}), 404

    # Retrieve top passages — fetch more to allow user filtering
    search_result = fts_search(
        query       = question,
        document_id = document_id,
        limit       = 20,
        offset      = 0,
    )

    all_passages = search_result.get("results", [])

    # Filter to current user's documents
    if all_passages:
        doc_ids = {p["document_id"] for p in all_passages}
        user_doc_ids = {
            d.id for d in Document.query.filter(
                Document.id.in_(doc_ids),
                Document.user_id == current_user.id,
            ).all()
        }
        passages = [p for p in all_passages if p["document_id"] in user_doc_ids][:5]
    else:
        passages = []

    if not passages:
        return jsonify({
            "question":        question,
            "answer_type":     "no_evidence",
            "message":         (
                "No relevant passages were found in your uploaded documents for this question. "
                "Try uploading documents that cover this topic, or rephrase your question "
                "using different keywords."
            ),
            "passages":        [],
            "total_searched":  search_result.get("total", 0),
        }), 200

    return jsonify({
        "question":    question,
        "answer_type": "retrieved_passages",
        "message": (
            "The passages below are retrieved directly from your uploaded documents. "
            "This system does not generate AI answers — it shows you exactly what your "
            "documents say. Read the source text and click 'View Source' to verify."
        ),
        "passages":       passages,
        "total_searched": search_result.get("total", 0),
    }), 200
