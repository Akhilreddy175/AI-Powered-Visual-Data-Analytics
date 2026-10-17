# This file tells Python that "python -m backend" should run backend.app.
from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
