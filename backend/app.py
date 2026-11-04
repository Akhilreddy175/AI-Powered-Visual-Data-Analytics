"""
Main Flask application entry point.

To start the server:
    cd "Visual Data Analytics"
    .venv\\Scripts\\activate
    python -m backend.app
"""

from pathlib import Path

from flask import Flask

from backend.config import Config
from backend.extensions import db, cors
from backend.routes.auth_routes import auth_bp
from backend.routes.analysis_routes import analysis_bp
from backend.routes.dashboard_routes import dashboard_bp
from backend.routes.document_routes import document_bp
from backend.routes.search_routes import search_bp
from backend.routes.rag_routes import rag_bp
from backend.routes.incident_routes import incident_bp


def create_app():
    """Application factory — creates and configures the Flask app."""

    app = Flask(__name__)
    app.config.from_object(Config)

    # Make sure required directories exist
    Path(app.config["UPLOAD_FOLDER"]).mkdir(exist_ok=True)
    Path(app.config["OUTPUT_FOLDER"]).mkdir(exist_ok=True)
    Path(app.config["DOCUMENT_FOLDER"]).mkdir(exist_ok=True)
    Path(__file__).resolve().parent.joinpath("instance").mkdir(exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    cors.init_app(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    # Register route blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(document_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(rag_bp)
    app.register_blueprint(incident_bp)

    # Create database tables if they don't exist yet
    with app.app_context():
        # Import models so SQLAlchemy knows about them
        from backend.models.models import User, Analysis, Detection  # noqa
        from backend.models.document_models import Document, DocumentChunk, ExtractedFact  # noqa
        from backend.models.incident_models import Incident  # noqa
        db.create_all()

        # Configure FTS5 service to use the same DB file as SQLAlchemy, then
        # ensure the FTS virtual table exists with the correct schema.
        from backend.services.fts_service import configure as fts_configure, ensure_fts_table
        fts_configure(app.config["SQLALCHEMY_DATABASE_URI"])
        ensure_fts_table()

    return app


# Run the server directly with: python -m backend.app
if __name__ == "__main__":
    app = create_app()
    print("=" * 60)
    print("  SafeVision AI Backend")
    print("  Running at: http://127.0.0.1:5000")
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    app.run(debug=True, port=5000)
