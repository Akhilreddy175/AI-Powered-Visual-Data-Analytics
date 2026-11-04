"""
Visual evidence retrieval for Milestone 3 RAG.
Retrieves PPE detection records from existing Milestone 1 tables.
"""
import logging
from backend.models.models import Analysis, Detection
from backend.extensions import db

log = logging.getLogger(__name__)

# Map violation class names to search-friendly terms
VIOLATION_KEYWORDS = {
    "no-hardhat": ["hardhat", "helmet", "head protection"],
    "no-safety vest": ["safety vest", "hi-vis", "visibility vest"],
    "no-gloves": ["gloves", "hand protection"],
    "no-goggles": ["goggles", "eye protection", "safety glasses"],
    "no-mask": ["mask", "respirator", "face protection"],
}

def get_recent_violations(user_id: int, limit: int = 10) -> list:
    """Get recent PPE violations for a user."""
    violations = (
        db.session.query(Detection, Analysis)
        .join(Analysis, Detection.analysis_id == Analysis.id)
        .filter(
            Analysis.user_id == user_id,
            Detection.is_violation == True,
        )
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_format_detection(det, ana) for det, ana in violations]


def get_violations_by_type(user_id: int, violation_type: str, limit: int = 5) -> list:
    """Get violations matching a specific type (case-insensitive partial match)."""
    violations = (
        db.session.query(Detection, Analysis)
        .join(Analysis, Detection.analysis_id == Analysis.id)
        .filter(
            Analysis.user_id == user_id,
            Detection.is_violation == True,
            Detection.class_label.ilike(f"%{violation_type}%"),
        )
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_format_detection(det, ana) for det, ana in violations]


def get_all_recent_analyses(user_id: int, limit: int = 5) -> list:
    """Get recent analyses with their violation summary."""
    analyses = (
        Analysis.query.filter_by(user_id=user_id, status="completed")
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for ana in analyses:
        violations = Detection.query.filter_by(analysis_id=ana.id, is_violation=True).all()
        result.append({
            "analysis_id": ana.id,
            "filename": ana.original_filename,
            "media_type": ana.media_type,
            "created_at": ana.created_at.isoformat() if ana.created_at else None,
            "total_detections": ana.total_detections,
            "violation_count": ana.violation_count,
            "violations": [_format_detection(d, ana) for d in violations[:5]],
        })
    return result


def infer_violation_type_from_question(question: str) -> str | None:
    """Attempt to identify which violation type the question is about."""
    q = question.lower()
    for vtype, keywords in VIOLATION_KEYWORDS.items():
        if vtype in q:
            return vtype
        for kw in keywords:
            if kw in q:
                return vtype
    return None


def _format_detection(det: Detection, ana: Analysis) -> dict:
    return {
        "detection_id": det.id,
        "analysis_id": ana.id,
        "analysis_filename": ana.original_filename,
        "media_type": ana.media_type,
        "class_label": det.class_label,
        "confidence": round(det.confidence, 3),
        "is_violation": det.is_violation,
        "frame_number": det.frame_number,
        "timestamp_seconds": det.timestamp_seconds,
        "created_at": ana.created_at.isoformat() if ana.created_at else None,
    }
