"""
Database models for the application.

Three tables:
  - User: stores registered users with hashed passwords
  - Analysis: stores each uploaded file and its processing results
  - Detection: stores individual detections found by the YOLO model
"""

from datetime import datetime, timezone

from backend.extensions import db


class User(db.Model):
    """A registered user of the application."""

    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(200), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationship: one user has many analyses
    analyses = db.relationship(
        "Analysis", backref="user", lazy="dynamic",
        cascade="all, delete-orphan"
    )

    def to_dict(self):
        """Return user info as a dictionary (never include password)."""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Analysis(db.Model):
    """One uploaded file that was analyzed by the YOLO model."""

    __tablename__ = "analysis"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )

    # Original filename as uploaded by the user
    original_filename = db.Column(db.String(300), nullable=False)
    # Unique filename stored on disk (prevents overwriting)
    stored_filename = db.Column(db.String(300), nullable=False)
    # "image" or "video"
    media_type = db.Column(db.String(10), nullable=False)
    # "processing", "completed", "failed"
    status = db.Column(db.String(20), default="processing")

    # Timestamps
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    # Results
    annotated_filename = db.Column(db.String(300), nullable=True)
    report_filename = db.Column(db.String(300), nullable=True)

    # Video-specific info
    frame_count = db.Column(db.Integer, nullable=True)
    duration_seconds = db.Column(db.Float, nullable=True)
    fps = db.Column(db.Float, nullable=True)

    # Counts (stored for quick dashboard queries)
    total_detections = db.Column(db.Integer, default=0)
    violation_count = db.Column(db.Integer, default=0)

    # Error message if processing failed
    error_message = db.Column(db.Text, nullable=True)

    # Relationship: one analysis has many detections
    detections = db.relationship(
        "Detection", backref="analysis", lazy="dynamic",
        cascade="all, delete-orphan"
    )

    def to_dict(self):
        """Return analysis info as a dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "original_filename": self.original_filename,
            "media_type": self.media_type,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "total_detections": self.total_detections,
            "violation_count": self.violation_count,
            "frame_count": self.frame_count,
            "duration_seconds": self.duration_seconds,
            "fps": self.fps,
            "annotated_filename": self.annotated_filename,
            "report_filename": self.report_filename,
            "error_message": self.error_message,
        }


class Detection(db.Model):
    """One object detected by the YOLO model in a single frame."""

    __tablename__ = "detection"

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(
        db.Integer, db.ForeignKey("analysis.id"), nullable=False, index=True
    )

    # The class label from the model (e.g. "Hardhat", "NO-Safety Vest")
    class_label = db.Column(db.String(100), nullable=False)
    # Model confidence score (0.0 to 1.0)
    confidence = db.Column(db.Float, nullable=False)
    # Whether this is a violation (class starts with "NO-")
    is_violation = db.Column(db.Boolean, default=False)

    # Video-specific fields
    frame_number = db.Column(db.Integer, nullable=True)
    timestamp_seconds = db.Column(db.Float, nullable=True)

    # Bounding box coordinates (x1, y1, x2, y2)
    bbox_x1 = db.Column(db.Float, nullable=True)
    bbox_y1 = db.Column(db.Float, nullable=True)
    bbox_x2 = db.Column(db.Float, nullable=True)
    bbox_y2 = db.Column(db.Float, nullable=True)

    def to_dict(self):
        """Return detection info as a dictionary."""
        return {
            "id": self.id,
            "analysis_id": self.analysis_id,
            "class_label": self.class_label,
            "confidence": self.confidence,
            "is_violation": self.is_violation,
            "frame_number": self.frame_number,
            "timestamp_seconds": self.timestamp_seconds,
            "bbox": {
                "x1": self.bbox_x1,
                "y1": self.bbox_y1,
                "x2": self.bbox_x2,
                "y2": self.bbox_y2,
            } if self.bbox_x1 is not None else None,
        }
