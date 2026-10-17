"""
Dashboard and Analytics API routes.

These endpoints provide aggregated statistics computed from the database.
All numbers come from actual stored analysis records — nothing is hardcoded.

Endpoints:
  GET /api/dashboard/stats              — KPI cards and recent activity
  GET /api/analytics/violations         — violation breakdown by category
  GET /api/analytics/media-comparison   — image vs video analysis counts
  GET /api/analytics/confidence         — confidence score distribution
  GET /api/analytics/timeline           — detections over time
  GET /api/analytics/video-timeline/<id> — violations over video time
"""

from flask import Blueprint, request, jsonify
from sqlalchemy import func

from backend.extensions import db
from backend.models.models import Analysis, Detection
from backend.services.auth_service import login_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard/stats", methods=["GET"])
@login_required
def dashboard_stats(current_user):
    """Return summary statistics for the dashboard KPI cards.

    All numbers are computed from the current user's data only.
    """
    user_analyses = Analysis.query.filter_by(
        user_id=current_user.id, status="completed"
    )

    total_analyses = user_analyses.count()
    image_analyses = user_analyses.filter_by(media_type="image").count()
    video_analyses = user_analyses.filter_by(media_type="video").count()

    # Sum up detection and violation counts across all analyses
    totals = db.session.query(
        func.coalesce(func.sum(Analysis.total_detections), 0),
        func.coalesce(func.sum(Analysis.violation_count), 0),
    ).filter(
        Analysis.user_id == current_user.id,
        Analysis.status == "completed",
    ).first()

    total_detections = totals[0]
    total_violations = totals[1]

    # Most frequently detected violation category
    most_common_violation = db.session.query(
        Detection.class_label,
        func.count(Detection.id).label("count"),
    ).join(Analysis).filter(
        Analysis.user_id == current_user.id,
        Detection.is_violation == True,
    ).group_by(Detection.class_label).order_by(
        func.count(Detection.id).desc()
    ).first()

    # Recent analyses (last 10)
    recent = user_analyses.order_by(
        Analysis.created_at.desc()
    ).limit(10).all()

    return jsonify({
        "total_analyses": total_analyses,
        "image_analyses": image_analyses,
        "video_analyses": video_analyses,
        "total_detections": total_detections,
        "total_violations": total_violations,
        "most_common_violation": {
            "label": most_common_violation[0],
            "count": most_common_violation[1],
        } if most_common_violation else None,
        "recent_analyses": [a.to_dict() for a in recent],
    }), 200


@dashboard_bp.route("/api/analytics/violations", methods=["GET"])
@login_required
def violation_breakdown(current_user):
    """Return violation counts grouped by PPE category.

    Used for the bar chart and donut chart on the Analytics page.

    Query parameters:
      - date_from: ISO date string (e.g. "2026-01-01")
      - date_to: ISO date string
      - media_type: "image" or "video"
    """
    query = db.session.query(
        Detection.class_label,
        func.count(Detection.id).label("count"),
        func.round(func.avg(Detection.confidence), 4).label("avg_confidence"),
    ).join(Analysis).filter(
        Analysis.user_id == current_user.id,
        Analysis.status == "completed",
        Detection.is_violation == True,
    )

    # Apply optional filters
    query = _apply_filters(query, request.args)

    results = query.group_by(Detection.class_label).order_by(
        func.count(Detection.id).desc()
    ).all()

    return jsonify({
        "violations": [
            {
                "category": r.class_label,
                "count": r.count,
                "avg_confidence": float(r.avg_confidence) if r.avg_confidence else 0,
            }
            for r in results
        ],
    }), 200


@dashboard_bp.route("/api/analytics/media-comparison", methods=["GET"])
@login_required
def media_comparison(current_user):
    """Return comparison between image and video analyses.

    Shows counts of analyses and violations for each media type.
    """
    result = []

    for media_type in ("image", "video"):
        analyses = Analysis.query.filter_by(
            user_id=current_user.id,
            status="completed",
            media_type=media_type,
        )
        count = analyses.count()

        totals = db.session.query(
            func.coalesce(func.sum(Analysis.total_detections), 0),
            func.coalesce(func.sum(Analysis.violation_count), 0),
        ).filter(
            Analysis.user_id == current_user.id,
            Analysis.status == "completed",
            Analysis.media_type == media_type,
        ).first()

        result.append({
            "media_type": media_type,
            "analysis_count": count,
            "total_detections": totals[0],
            "total_violations": totals[1],
        })

    return jsonify({"comparison": result}), 200


@dashboard_bp.route("/api/analytics/confidence", methods=["GET"])
@login_required
def confidence_distribution(current_user):
    """Return the distribution of confidence scores in defined ranges.

    Ranges: 0.0-0.3, 0.3-0.5, 0.5-0.7, 0.7-0.9, 0.9-1.0

    Query parameters:
      - violations_only: if "true", only count violation detections
    """
    base_query = Detection.query.join(Analysis).filter(
        Analysis.user_id == current_user.id,
        Analysis.status == "completed",
    )

    if request.args.get("violations_only") == "true":
        base_query = base_query.filter(Detection.is_violation == True)

    ranges = [
        ("0.00-0.30", 0.0, 0.3),
        ("0.30-0.50", 0.3, 0.5),
        ("0.50-0.70", 0.5, 0.7),
        ("0.70-0.90", 0.7, 0.9),
        ("0.90-1.00", 0.9, 1.01),
    ]

    distribution = []
    for label, low, high in ranges:
        count = base_query.filter(
            Detection.confidence >= low,
            Detection.confidence < high,
        ).count()
        distribution.append({"range": label, "count": count})

    return jsonify({"distribution": distribution}), 200


@dashboard_bp.route("/api/analytics/timeline", methods=["GET"])
@login_required
def detection_timeline(current_user):
    """Return detection counts grouped by date.

    Used for the "activity over time" line chart.

    Query parameters:
      - date_from: ISO date string
      - date_to: ISO date string
      - media_type: "image" or "video"
    """
    query = db.session.query(
        func.date(Analysis.created_at).label("date"),
        func.count(Analysis.id).label("analysis_count"),
        func.coalesce(func.sum(Analysis.total_detections), 0).label("detections"),
        func.coalesce(func.sum(Analysis.violation_count), 0).label("violations"),
    ).filter(
        Analysis.user_id == current_user.id,
        Analysis.status == "completed",
    )

    # Apply optional filters
    media_type = request.args.get("media_type")
    if media_type in ("image", "video"):
        query = query.filter(Analysis.media_type == media_type)

    date_from = request.args.get("date_from")
    if date_from:
        query = query.filter(Analysis.created_at >= date_from)

    date_to = request.args.get("date_to")
    if date_to:
        query = query.filter(Analysis.created_at <= date_to + "T23:59:59")

    results = query.group_by(
        func.date(Analysis.created_at)
    ).order_by(
        func.date(Analysis.created_at)
    ).all()

    return jsonify({
        "timeline": [
            {
                "date": str(r.date),
                "analysis_count": r.analysis_count,
                "detections": r.detections,
                "violations": r.violations,
            }
            for r in results
        ],
    }), 200


@dashboard_bp.route("/api/analytics/video-timeline/<int:analysis_id>", methods=["GET"])
@login_required
def video_violation_timeline(current_user, analysis_id):
    """Return violation detections over time for a specific video.

    Groups violations into 1-second intervals so the chart is readable.
    """
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id, media_type="video"
    ).first()

    if analysis is None:
        return jsonify({"error": "Video analysis not found."}), 404

    detections = Detection.query.filter_by(
        analysis_id=analysis.id,
        is_violation=True,
    ).order_by(Detection.timestamp_seconds).all()

    # Group violations into 1-second time buckets
    buckets = {}
    for d in detections:
        second = int(d.timestamp_seconds) if d.timestamp_seconds else 0
        if second not in buckets:
            buckets[second] = {"time_second": second, "count": 0, "categories": {}}
        buckets[second]["count"] += 1
        cat = d.class_label
        buckets[second]["categories"][cat] = buckets[second]["categories"].get(cat, 0) + 1

    timeline = sorted(buckets.values(), key=lambda b: b["time_second"])

    return jsonify({
        "analysis_id": analysis.id,
        "duration_seconds": analysis.duration_seconds,
        "timeline": timeline,
    }), 200


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _apply_filters(query, args):
    """Apply common date and media_type filters to a query."""
    media_type = args.get("media_type")
    if media_type in ("image", "video"):
        query = query.filter(Analysis.media_type == media_type)

    date_from = args.get("date_from")
    if date_from:
        query = query.filter(Analysis.created_at >= date_from)

    date_to = args.get("date_to")
    if date_to:
        query = query.filter(Analysis.created_at <= date_to + "T23:59:59")

    return query
