"""
Incident management routes — Milestone 3.

Endpoints:
  GET    /api/incidents        — list incidents for current user
  GET    /api/incidents/<id>   — get single incident
  DELETE /api/incidents/<id>   — delete an incident
"""

from flask import Blueprint, jsonify, request
from backend.extensions import db
from backend.models.incident_models import Incident
from backend.services.auth_service import login_required

incident_bp = Blueprint("incidents", __name__, url_prefix="/api/incidents")


@incident_bp.route("", methods=["GET"])
@login_required
def list_incidents(current_user):
    """List incidents with optional status filter and pagination."""
    query = Incident.query.filter_by(user_id=current_user.id)

    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)

    limit  = min(int(request.args.get("limit",  20)), 100)
    offset = int(request.args.get("offset", 0))
    total  = query.count()
    items  = query.order_by(Incident.created_at.desc()).offset(offset).limit(limit).all()

    return jsonify({
        "incidents": [i.to_dict() for i in items],
        "total":     total,
        "limit":     limit,
        "offset":    offset,
    }), 200


@incident_bp.route("/<int:incident_id>", methods=["GET"])
@login_required
def get_incident(current_user, incident_id):
    """Get a single incident by ID."""
    incident = Incident.query.filter_by(id=incident_id, user_id=current_user.id).first()
    if not incident:
        return jsonify({"error": "Incident not found."}), 404
    return jsonify(incident.to_dict()), 200


@incident_bp.route("/<int:incident_id>", methods=["DELETE"])
@login_required
def delete_incident(current_user, incident_id):
    """Delete an incident."""
    incident = Incident.query.filter_by(id=incident_id, user_id=current_user.id).first()
    if not incident:
        return jsonify({"error": "Incident not found."}), 404
    db.session.delete(incident)
    db.session.commit()
    return jsonify({"message": "Incident deleted."}), 200
