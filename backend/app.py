"""
Main Flask application entry point.

This file creates the Flask app, initializes extensions, registers route
blueprints, and creates the database tables on first run.

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


def create_app():
    """Application factory — creates and configures the Flask app."""

    app = Flask(__name__)
    app.config.from_object(Config)

    # Make sure required directories exist
    Path(app.config["UPLOAD_FOLDER"]).mkdir(exist_ok=True)
    Path(app.config["OUTPUT_FOLDER"]).mkdir(exist_ok=True)
    Path(__file__).resolve().parent.joinpath("instance").mkdir(exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    cors.init_app(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    # Register route blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(dashboard_bp)

    # Create database tables if they don't exist yet
    with app.app_context():
        # Import models so SQLAlchemy knows about them
        from backend.models.models import User, Analysis, Detection  # noqa
        db.create_all()

    return app


# Run the server directly with: python -m backend.app
if __name__ == "__main__":
    app = create_app()
    print("=" * 60)
    print("  PPE Detection Backend API")
    print("  Running at: http://127.0.0.1:5000")
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    app.run(debug=True, port=5000)
