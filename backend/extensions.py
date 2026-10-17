"""
Flask extensions initialized here.

We create the extensions outside of the app factory so that they can be
imported by other modules (models, routes) without circular imports.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

# Database object — used in models and routes
db = SQLAlchemy()

# CORS object — allows the React frontend to call the Flask API
cors = CORS()
