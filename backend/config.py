"""
Configuration for the Flask application.

All settings are defined here in one place so they are easy to find and change.
"""

import os
from pathlib import Path

# Base directory is the project root (one level above backend/)
BASE_DIR = Path(__file__).resolve().parent.parent

class Config:
    """Application configuration."""

    # Secret key for signing session cookies and JWT tokens.
    # In production, this should be a long random string stored in an
    # environment variable. For development, we use a default value.
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    # SQLite database file stored inside backend/instance/
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + str(
        Path(__file__).resolve().parent / "instance" / "app.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # File upload settings
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500 MB max upload size
    UPLOAD_FOLDER = str(BASE_DIR / "uploads")
    OUTPUT_FOLDER = str(BASE_DIR / "outputs")

    # Path to the trained PPE detection model
    MODEL_PATH = str(BASE_DIR / "best.pt")

    # Allowed file extensions
    ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
    ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}

    # JWT token expiry in seconds (24 hours)
    JWT_EXPIRY_SECONDS = 86400

    # CORS settings for local development
    CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
