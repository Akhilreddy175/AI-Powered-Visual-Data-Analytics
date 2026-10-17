"""
Authentication API routes.

Endpoints:
  POST /api/auth/register  — create a new user account
  POST /api/auth/login     — sign in and receive a JWT token
  POST /api/auth/logout    — sign out (client discards token)
  GET  /api/auth/me        — get the current user's info
"""

from flask import Blueprint, request, jsonify

from backend.extensions import db
from backend.models.models import User
from backend.services.auth_service import (
    hash_password,
    verify_password,
    create_token,
    login_required,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    """Create a new user account.

    Expects JSON:
        { "name": "...", "email": "...", "password": "..." }

    Returns the new user's info and a JWT token.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    # Validation
    errors = []
    if not name:
        errors.append("Name is required.")
    if not email:
        errors.append("Email is required.")
    elif "@" not in email or "." not in email:
        errors.append("Email is not valid.")
    if not password:
        errors.append("Password is required.")
    elif len(password) < 6:
        errors.append("Password must be at least 6 characters.")

    if errors:
        return jsonify({"error": " ".join(errors)}), 400

    # Check for existing user
    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({"error": "An account with this email already exists."}), 409

    # Create user
    user = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
    )
    db.session.add(user)
    db.session.commit()

    token = create_token(user.id)

    return jsonify({
        "message": "Account created successfully.",
        "user": user.to_dict(),
        "token": token,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """Sign in with email and password.

    Expects JSON:
        { "email": "...", "password": "..." }

    Returns the user's info and a JWT token.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = User.query.filter_by(email=email).first()

    if user is None or not verify_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password."}), 401

    token = create_token(user.id)

    return jsonify({
        "message": "Login successful.",
        "user": user.to_dict(),
        "token": token,
    }), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Sign out.

    With JWT tokens, the server does not need to do anything.
    The client simply discards the token.
    """
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def me(current_user):
    """Get the current signed-in user's information."""
    return jsonify({"user": current_user.to_dict()}), 200
