"""
Authentication helpers.

Provides functions for:
  - Hashing and verifying passwords using bcrypt
  - Creating and verifying JWT tokens
  - A decorator to protect API endpoints
"""

from functools import wraps
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from flask import request, jsonify, current_app

from backend.models.models import User


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt.

    bcrypt automatically generates a random salt and includes it in the
    returned hash, so we do not need to store the salt separately.
    """
    password_bytes = plain_password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check whether a plain-text password matches the stored hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        password_hash.encode("utf-8"),
    )


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------

def create_token(user_id: int) -> str:
    """Create a signed JWT token containing the user's ID.

    The token expires after the number of seconds defined in the config.
    """
    expiry = datetime.now(timezone.utc) + timedelta(
        seconds=current_app.config["JWT_EXPIRY_SECONDS"]
    )
    payload = {
        "user_id": user_id,
        "exp": expiry,
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """Decode and verify a JWT token. Returns the payload or None."""
    try:
        return jwt.decode(
            token,
            current_app.config["SECRET_KEY"],
            algorithms=["HS256"],
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


# ---------------------------------------------------------------------------
# Route protection decorator
# ---------------------------------------------------------------------------

def login_required(f):
    """Decorator that requires a valid JWT token in the Authorization header.

    Usage:
        @app.route("/api/protected")
        @login_required
        def my_endpoint(current_user):
            # current_user is the User object from the database
            ...

    The token must be sent as:
        Authorization: Bearer <token>
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required."}), 401

        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)

        if payload is None:
            return jsonify({"error": "Invalid or expired token."}), 401

        current_user = User.query.get(payload["user_id"])
        if current_user is None:
            return jsonify({"error": "User not found."}), 401

        return f(current_user, *args, **kwargs)

    return decorated
