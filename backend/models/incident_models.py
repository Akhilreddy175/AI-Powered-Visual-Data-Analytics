"""
Incident model for Milestone 3 — LangGraph investigation results.
"""
from datetime import datetime, timezone
from backend.extensions import db

class Incident(db.Model):
    __tablename__ = "incident"
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    
    # What triggered this incident
    violation_type = db.Column(db.String(100), nullable=True)  # e.g. "NO-Hardhat"
    analysis_id = db.Column(db.Integer, db.ForeignKey("analysis.id"), nullable=True)
    detection_id = db.Column(db.Integer, nullable=True)  # specific detection
    confidence = db.Column(db.Float, nullable=True)
    
    # Document evidence
    document_id = db.Column(db.Integer, db.ForeignKey("document.id"), nullable=True)
    chunk_id = db.Column(db.Integer, nullable=True)
    
    # Investigation
    question = db.Column(db.Text, nullable=True)  # original user question
    investigation_summary = db.Column(db.Text, nullable=True)
    visual_evidence_json = db.Column(db.Text, nullable=True)  # JSON string
    document_evidence_json = db.Column(db.Text, nullable=True)  # JSON string
    workflow_steps_json = db.Column(db.Text, nullable=True)  # JSON list of step outcomes
    
    # Status
    status = db.Column(db.String(30), default="new")
    # Values: new | investigating | logged | failed
    
    alert_status = db.Column(db.String(30), default="pending")
    # Values: pending | sent | skipped | failed
    alert_message = db.Column(db.Text, nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    def to_dict(self):
        import json
        return {
            "id": self.id,
            "user_id": self.user_id,
            "violation_type": self.violation_type,
            "analysis_id": self.analysis_id,
            "detection_id": self.detection_id,
            "confidence": self.confidence,
            "document_id": self.document_id,
            "chunk_id": self.chunk_id,
            "question": self.question,
            "investigation_summary": self.investigation_summary,
            "visual_evidence": json.loads(self.visual_evidence_json) if self.visual_evidence_json else None,
            "document_evidence": json.loads(self.document_evidence_json) if self.document_evidence_json else None,
            "workflow_steps": json.loads(self.workflow_steps_json) if self.workflow_steps_json else [],
            "status": self.status,
            "alert_status": self.alert_status,
            "alert_message": self.alert_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
