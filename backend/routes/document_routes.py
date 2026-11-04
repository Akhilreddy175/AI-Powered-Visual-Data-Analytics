"""
Document API routes — upload, process, query, and manage documents.

Endpoints:
  POST   /api/documents              — upload one or more documents
  GET    /api/documents              — list documents (with filters)
  GET    /api/documents/stats        — repository statistics
  GET    /api/documents/<id>         — document metadata + fact count
  GET    /api/documents/<id>/text    — extracted text (all chunks)
  GET    /api/documents/<id>/download— download original file
  GET    /api/documents/<id>/extracted-info  — structured extracted facts
  POST   /api/documents/<id>/reprocess      — re-run extraction
  DELETE /api/documents/<id>         — delete document and its files
"""

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request, current_app, send_from_directory
from werkzeug.utils import secure_filename

from backend.extensions import db
from backend.models.document_models import Document, DocumentChunk, ExtractedFact
from backend.services.auth_service import login_required
from backend.services.document_service import process_document, sha256_of_file

document_bp = Blueprint("documents", __name__, url_prefix="/api/documents")

# Allowed document extensions and their canonical type names
ALLOWED_EXTENSIONS = {
    ".pdf":  "pdf",
    ".docx": "docx",
    ".txt":  "txt",
    ".doc":  "docx",   # We'll try python-docx; real .doc is binary but sometimes works
}

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per document


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@document_bp.route("", methods=["POST"])
@login_required
def upload_documents(current_user):
    """Upload one or more documents and trigger processing."""
    files = request.files.getlist("files")
    files = [f for f in files if f.filename]

    if not files:
        return jsonify({"error": "No files provided."}), 400

    doc_folder = Path(current_app.config["DOCUMENT_FOLDER"])
    doc_folder.mkdir(exist_ok=True)

    category = request.form.get("category", "").strip() or None
    results  = []
    errors   = []

    for uploaded_file in files:
        original_name = uploaded_file.filename
        safe_name     = secure_filename(original_name)

        if not safe_name:
            errors.append(f"Invalid filename: {original_name!r}")
            continue

        ext = Path(safe_name).suffix.lower()
        file_type = ALLOWED_EXTENSIONS.get(ext)
        if not file_type:
            errors.append(
                f"{original_name}: unsupported file type ({ext}). "
                f"Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )
            continue

        # Read into memory to check size and compute hash
        file_bytes = uploaded_file.read()
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            errors.append(
                f"{original_name}: file is too large "
                f"({len(file_bytes) // 1024} KB; limit is {MAX_UPLOAD_BYTES // 1024 // 1024} MB)."
            )
            continue

        if len(file_bytes) == 0:
            errors.append(f"{original_name}: file is empty.")
            continue

        # Generate unique stored filename
        ts = datetime.now().strftime("%Y%m%d%H%M%S%f")
        stored_name = f"{ts}_{safe_name}"
        file_path   = doc_folder / stored_name

        # Save to disk
        file_path.write_bytes(file_bytes)

        # Compute content hash
        content_hash = hashlib.sha256(file_bytes).hexdigest()

        # Create database record
        doc = Document(
            user_id           = current_user.id,
            original_filename = original_name,
            stored_filename   = stored_name,
            file_type         = file_type,
            file_size_bytes   = len(file_bytes),
            category          = category,
            status            = "pending",
            content_hash      = content_hash,
        )
        db.session.add(doc)
        db.session.commit()

        # Process synchronously (extraction + indexing)
        try:
            process_document(doc.id, file_path)
            db.session.refresh(doc)
        except Exception as exc:
            doc.status = "failed"
            doc.processing_error = str(exc)
            db.session.commit()
            errors.append(f"{original_name}: processing failed — {exc}")

        results.append(doc.to_dict())

    response = {"documents": results}
    if errors:
        response["errors"] = errors

    return jsonify(response), 201 if results else 400


# ---------------------------------------------------------------------------
# List / Filter
# ---------------------------------------------------------------------------

@document_bp.route("", methods=["GET"])
@login_required
def list_documents(current_user):
    """List documents with optional filtering and pagination."""
    query = Document.query.filter_by(user_id=current_user.id)

    # Filters
    status    = request.args.get("status")
    file_type = request.args.get("file_type")
    category  = request.args.get("category")
    search_q  = request.args.get("q", "").strip()

    if status:
        query = query.filter_by(status=status)
    if file_type:
        query = query.filter_by(file_type=file_type)
    if category:
        query = query.filter_by(category=category)
    if search_q:
        query = query.filter(
            Document.original_filename.ilike(f"%{search_q}%")
        )

    # Sorting
    sort_by = request.args.get("sort", "created_at")
    if sort_by not in ("created_at", "original_filename", "file_size_bytes", "status"):
        sort_by = "created_at"
    order   = request.args.get("order", "desc")
    col     = getattr(Document, sort_by)
    query   = query.order_by(col.desc() if order == "desc" else col.asc())

    # Pagination
    limit  = min(int(request.args.get("limit",  50)), 200)
    offset = int(request.args.get("offset", 0))
    total  = query.count()
    docs   = query.offset(offset).limit(limit).all()

    return jsonify({
        "documents": [d.to_dict() for d in docs],
        "total":     total,
        "limit":     limit,
        "offset":    offset,
    }), 200


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@document_bp.route("/stats", methods=["GET"])
@login_required
def document_stats(current_user):
    """Return repository-level statistics derived from real database records."""
    base = Document.query.filter_by(user_id=current_user.id)

    total      = base.count()
    completed  = base.filter_by(status="completed").count()
    partial    = base.filter_by(status="partial").count()
    failed     = base.filter_by(status="failed").count()
    pending    = base.filter(Document.status.in_(["pending", "extracting", "indexing"])).count()

    by_type    = {}
    for ft in ("pdf", "docx", "txt"):
        by_type[ft] = base.filter_by(file_type=ft).count()

    by_category = {}
    for doc in base.all():
        cat = doc.category or "uncategorized"
        by_category[cat] = by_category.get(cat, 0) + 1

    # Total chunks indexed
    chunk_count = (
        db.session.query(db.func.count(DocumentChunk.id))
        .join(Document)
        .filter(Document.user_id == current_user.id)
        .scalar()
    ) or 0

    # Total facts extracted
    fact_count = (
        db.session.query(db.func.count(ExtractedFact.id))
        .join(Document)
        .filter(Document.user_id == current_user.id)
        .scalar()
    ) or 0

    # Recent uploads (last 5)
    recent = (
        base.order_by(Document.created_at.desc()).limit(5).all()
    )

    return jsonify({
        "total":           total,
        "completed":       completed,
        "partial":         partial,
        "failed":          failed,
        "processing":      pending,
        "by_type":         by_type,
        "by_category":     by_category,
        "indexed_chunks":  chunk_count,
        "extracted_facts": fact_count,
        "recent":          [d.to_dict() for d in recent],
    }), 200


# ---------------------------------------------------------------------------
# Single document
# ---------------------------------------------------------------------------

@document_bp.route("/<int:document_id>", methods=["GET"])
@login_required
def get_document(current_user, document_id):
    """Get full metadata for a single document."""
    doc = _get_doc_or_404(document_id, current_user.id)
    return jsonify(doc.to_dict()), 200


@document_bp.route("/<int:document_id>/text", methods=["GET"])
@login_required
def get_document_text(current_user, document_id):
    """Return all extracted text chunks for a document.

    Query params:
      page   — filter by page number
      limit  — max chunks (default 50)
      offset — pagination
    """
    doc = _get_doc_or_404(document_id, current_user.id)

    query = DocumentChunk.query.filter_by(document_id=doc.id).order_by(
        DocumentChunk.chunk_index
    )

    page_filter = request.args.get("page")
    if page_filter:
        query = query.filter_by(page_number=int(page_filter))

    limit  = min(int(request.args.get("limit",  50)), 500)
    offset = int(request.args.get("offset", 0))
    total  = query.count()
    chunks = query.offset(offset).limit(limit).all()

    return jsonify({
        "document_id": doc.id,
        "chunks":      [c.to_dict() for c in chunks],
        "total":       total,
        "limit":       limit,
        "offset":      offset,
    }), 200


@document_bp.route("/<int:document_id>/download", methods=["GET"])
@login_required
def download_document(current_user, document_id):
    """Download the original uploaded file."""
    doc = _get_doc_or_404(document_id, current_user.id)
    doc_folder = Path(current_app.config["DOCUMENT_FOLDER"]).resolve()
    return send_from_directory(
        str(doc_folder),
        doc.stored_filename,
        as_attachment=True,
        download_name=doc.original_filename,
    )


@document_bp.route("/<int:document_id>/extracted-info", methods=["GET"])
@login_required
def get_extracted_info(current_user, document_id):
    """Return structured extracted facts for a document.

    Query params:
      fact_type — filter by type (e.g. hazard, ppe_requirement)
    """
    doc = _get_doc_or_404(document_id, current_user.id)

    query = ExtractedFact.query.filter_by(document_id=doc.id)

    fact_type = request.args.get("fact_type")
    if fact_type:
        query = query.filter_by(fact_type=fact_type)

    facts = query.order_by(ExtractedFact.page_number.asc()).all()

    # Group by fact_type for convenience
    grouped = {}
    for f in facts:
        grouped.setdefault(f.fact_type, []).append(f.to_dict())

    return jsonify({
        "document_id":  doc.id,
        "document_name": doc.original_filename,
        "facts":        grouped,
        "total_facts":  len(facts),
    }), 200


@document_bp.route("/<int:document_id>/reprocess", methods=["POST"])
@login_required
def reprocess_document(current_user, document_id):
    """Re-run extraction and indexing on an existing document."""
    doc = _get_doc_or_404(document_id, current_user.id)

    doc_folder = Path(current_app.config["DOCUMENT_FOLDER"])
    file_path  = doc_folder / doc.stored_filename

    if not file_path.exists():
        return jsonify({"error": "Original file no longer exists on disk."}), 409

    try:
        process_document(doc.id, file_path)
        db.session.refresh(doc)
    except Exception as exc:
        return jsonify({"error": f"Reprocessing failed: {exc}"}), 500

    return jsonify(doc.to_dict()), 200


@document_bp.route("/<int:document_id>", methods=["DELETE"])
@login_required
def delete_document(current_user, document_id):
    """Delete a document, its extracted data, and its FTS5 index entries."""
    doc = _get_doc_or_404(document_id, current_user.id)

    # Remove from FTS5 first
    try:
        from backend.services.fts_service import remove_document_from_fts
        remove_document_from_fts(doc.id)
    except Exception:
        pass  # Non-fatal: FTS entries will be stale but won't cause errors

    # Delete file from disk
    doc_folder = Path(current_app.config["DOCUMENT_FOLDER"])
    file_path  = doc_folder / doc.stored_filename
    if file_path.exists():
        file_path.unlink()

    # Delete database record (cascades to chunks + facts)
    db.session.delete(doc)
    db.session.commit()

    return jsonify({"message": "Document deleted."}), 200


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _get_doc_or_404(document_id: int, user_id: int) -> Document:
    """Fetch a document by ID belonging to user, or abort with 404."""
    from flask import abort
    doc = Document.query.filter_by(id=document_id, user_id=user_id).first()
    if doc is None:
        abort(404, description="Document not found.")
    return doc
