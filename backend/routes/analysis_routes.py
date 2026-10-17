"""
Analysis API routes — upload media, run detection, and view results.

Endpoints:
  POST   /api/analyses                     — upload and analyze files
  GET    /api/analyses                     — list the user's analyses
  GET    /api/analyses/<id>                — get one analysis with details
  GET    /api/analyses/<id>/detections     — get detections for an analysis
  GET    /api/analyses/<id>/report         — download CSV report
  GET    /api/analyses/<id>/output         — download/view annotated output
  GET    /api/analyses/<id>/original       — download/view original file
  DELETE /api/analyses/<id>                — delete an analysis and its files
"""

from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename

from backend.extensions import db
from backend.models.models import Analysis, Detection
from backend.services.auth_service import login_required
from backend.services.detection_service import process_image, process_video

analysis_bp = Blueprint("analysis", __name__, url_prefix="/api/analyses")


def _allowed_extension(filename: str) -> str | None:
    """Check if the file extension is allowed. Returns the media type or None."""
    ext = Path(filename).suffix.lower()
    image_exts = current_app.config["ALLOWED_IMAGE_EXTENSIONS"]
    video_exts = current_app.config["ALLOWED_VIDEO_EXTENSIONS"]

    if ext in image_exts:
        return "image"
    elif ext in video_exts:
        return "video"
    return None


@analysis_bp.route("", methods=["POST"])
@login_required
def upload_and_analyze(current_user):
    """Upload one or more files and run PPE detection on each.

    Accepts multipart/form-data with field name "files".
    Returns a list of analysis results.
    """
    files = request.files.getlist("files")
    files = [f for f in files if f.filename]

    if not files:
        return jsonify({"error": "Please select at least one file."}), 400

    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    output_dir = Path(current_app.config["OUTPUT_FOLDER"])
    model_path = current_app.config["MODEL_PATH"]

    upload_dir.mkdir(exist_ok=True)
    output_dir.mkdir(exist_ok=True)

    results = []
    errors = []

    for uploaded_file in files:
        original_name = uploaded_file.filename
        safe_name = secure_filename(original_name)

        if not safe_name:
            errors.append(f"Invalid filename: {original_name}")
            continue

        media_type = _allowed_extension(safe_name)
        if media_type is None:
            errors.append(f"Unsupported file type: {original_name}")
            continue

        # Create a unique filename to prevent overwriting
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
        unique_name = f"{timestamp}_{safe_name}"
        input_path = upload_dir / unique_name

        # Determine output paths
        ext = Path(safe_name).suffix.lower()
        stem = Path(unique_name).stem
        output_ext = ".jpg" if media_type == "image" else ".mp4"
        annotated_name = f"{stem}_detected{output_ext}"
        report_name = f"{stem}_report.csv"
        output_path = output_dir / annotated_name
        report_path = output_dir / report_name

        # Create analysis record in the database
        analysis = Analysis(
            user_id=current_user.id,
            original_filename=original_name,
            stored_filename=unique_name,
            media_type=media_type,
            status="processing",
        )
        db.session.add(analysis)
        db.session.commit()  # Commit to get the analysis ID

        try:
            # Save the uploaded file to disk
            uploaded_file.save(str(input_path))

            # Run detection
            if media_type == "image":
                process_image(analysis, input_path, output_path, report_path, model_path)
            else:
                process_video(analysis, input_path, output_path, report_path, model_path)

            results.append(analysis.to_dict())

        except Exception as exc:
            analysis.status = "failed"
            analysis.error_message = str(exc)
            analysis.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            errors.append(f"Error processing {original_name}: {exc}")

    response = {"analyses": results}
    if errors:
        response["errors"] = errors

    status_code = 201 if results else 400
    return jsonify(response), status_code


@analysis_bp.route("", methods=["GET"])
@login_required
def list_analyses(current_user):
    """List all analyses for the current user.

    Query parameters:
      - media_type: filter by "image" or "video"
      - status: filter by "completed", "processing", or "failed"
      - limit: max number of results (default 50)
      - offset: pagination offset (default 0)
    """
    query = Analysis.query.filter_by(user_id=current_user.id)

    media_type = request.args.get("media_type")
    if media_type in ("image", "video"):
        query = query.filter_by(media_type=media_type)

    status = request.args.get("status")
    if status in ("completed", "processing", "failed"):
        query = query.filter_by(status=status)

    # Order by newest first
    query = query.order_by(Analysis.created_at.desc())

    # Pagination
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))
    total = query.count()
    analyses = query.offset(offset).limit(limit).all()

    return jsonify({
        "analyses": [a.to_dict() for a in analyses],
        "total": total,
        "limit": limit,
        "offset": offset,
    }), 200


@analysis_bp.route("/<int:analysis_id>", methods=["GET"])
@login_required
def get_analysis(current_user, analysis_id):
    """Get details of a single analysis, including its detections."""
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    # Include detections in the response
    detections = Detection.query.filter_by(analysis_id=analysis.id).all()

    result = analysis.to_dict()
    result["detections"] = [d.to_dict() for d in detections]

    return jsonify(result), 200


@analysis_bp.route("/<int:analysis_id>/detections", methods=["GET"])
@login_required
def get_detections(current_user, analysis_id):
    """Get all detections for a specific analysis.

    Query parameters:
      - violations_only: if "true", only return violation detections
    """
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    query = Detection.query.filter_by(analysis_id=analysis.id)

    if request.args.get("violations_only") == "true":
        query = query.filter_by(is_violation=True)

    detections = query.all()

    return jsonify({
        "detections": [d.to_dict() for d in detections],
        "total": len(detections),
    }), 200


@analysis_bp.route("/<int:analysis_id>/report", methods=["GET"])
@login_required
def download_report(current_user, analysis_id):
    """Download the CSV report for an analysis."""
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    if not analysis.report_filename:
        return jsonify({"error": "No report available."}), 404

    output_dir = Path(current_app.config["OUTPUT_FOLDER"]).resolve()
    return send_from_directory(
        str(output_dir),
        analysis.report_filename,
        as_attachment=True,
        download_name=f"{Path(analysis.original_filename).stem}_report.csv",
    )


@analysis_bp.route("/<int:analysis_id>/output", methods=["GET"])
@login_required
def view_output(current_user, analysis_id):
    """View or download the annotated output file."""
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    if not analysis.annotated_filename:
        return jsonify({"error": "No output available."}), 404

    output_dir = Path(current_app.config["OUTPUT_FOLDER"]).resolve()
    return send_from_directory(str(output_dir), analysis.annotated_filename)


@analysis_bp.route("/<int:analysis_id>/original", methods=["GET"])
@login_required
def view_original(current_user, analysis_id):
    """View or download the original uploaded file."""
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    upload_dir = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    return send_from_directory(str(upload_dir), analysis.stored_filename)


@analysis_bp.route("/<int:analysis_id>", methods=["DELETE"])
@login_required
def delete_analysis(current_user, analysis_id):
    """Delete an analysis and its associated files."""
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()

    if analysis is None:
        return jsonify({"error": "Analysis not found."}), 404

    # Delete files from disk
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    output_dir = Path(current_app.config["OUTPUT_FOLDER"])

    for filename, directory in [
        (analysis.stored_filename, upload_dir),
        (analysis.annotated_filename, output_dir),
        (analysis.report_filename, output_dir),
    ]:
        if filename:
            file_path = directory / filename
            if file_path.exists():
                file_path.unlink()

    # Delete from database (cascades to detections)
    db.session.delete(analysis)
    db.session.commit()

    return jsonify({"message": "Analysis deleted."}), 200
