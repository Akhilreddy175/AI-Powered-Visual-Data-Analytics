
from flask import Flask, render_template, request, url_for
from werkzeug.utils import secure_filename
from pathlib import Path
from datetime import datetime
import csv
import cv2
from ultralytics import YOLO

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500 MB

UPLOAD_FOLDER = Path("uploads")
OUTPUT_FOLDER = Path("outputs")

UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

IMAGE_TYPES = {".jpg", ".jpeg", ".png"}
VIDEO_TYPES = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}

# Load the model once when the application starts
model = YOLO("best.pt")


def process_image(file_path, output_path):
    results = model.predict(source=str(file_path), conf=0.25, verbose=False)

    violations = []

    for result in results:
        cv2.imwrite(str(output_path), result.plot())

        for box in result.boxes:
            label = model.names[int(box.cls[0])]
            confidence = float(box.conf[0])

            if label.startswith("NO-"):
                violations.append({
                    "violation": label,
                    "confidence": round(confidence, 2),
                    "time_seconds": ""
                })

    return violations


def process_video(file_path, output_path):
    cap = cv2.VideoCapture(str(file_path))

    if not cap.isOpened():
        cap.release()
        raise ValueError("Could not open the uploaded video.")

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if fps <= 0 or width <= 0 or height <= 0:
        cap.release()
        raise ValueError("The uploaded video has invalid properties.")

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height)
    )

    if not writer.isOpened():
        cap.release()
        raise ValueError("Could not create the output video.")

    violations = []
    frame_number = 0

    try:
        while True:
            success, frame = cap.read()

            if not success:
                break

            frame_number += 1
            results = model.predict(frame, conf=0.25, verbose=False)

            for result in results:
                writer.write(result.plot())

                for box in result.boxes:
                    label = model.names[int(box.cls[0])]
                    confidence = float(box.conf[0])

                    if label.startswith("NO-"):
                        violations.append({
                            "violation": label,
                            "confidence": round(confidence, 2),
                            "time_seconds": round((frame_number - 1) / fps, 2)
                        })
    finally:
        cap.release()
        writer.release()

    return violations


@app.route("/", methods=["GET", "POST"])
def index():
    results = []
    error = None

    if request.method == "POST":
        files = request.files.getlist("files")

        files = [f for f in files if f.filename]

        if not files:
            error = "Please select at least one image or video."
        else:
            for uploaded_file in files:
                original_name = secure_filename(uploaded_file.filename)
                extension = Path(original_name).suffix.lower()

                if extension not in IMAGE_TYPES | VIDEO_TYPES:
                    error = f"Unsupported file type: {original_name}"
                    continue

                # Avoid overwriting results from previous uploads
                unique_name = (
                    datetime.now().strftime("%Y%m%d%H%M%S%f")
                    + "_" + original_name
                )

                input_path = UPLOAD_FOLDER / unique_name
                output_extension = ".jpg" if extension in IMAGE_TYPES else ".mp4"
                output_name = Path(unique_name).stem + "_detected" + output_extension
                output_path = OUTPUT_FOLDER / output_name

                try:
                    uploaded_file.save(str(input_path))

                    if extension in IMAGE_TYPES:
                        violations = process_image(input_path, output_path)
                        media_type = "image"
                    else:
                        violations = process_video(input_path, output_path)
                        media_type = "video"

                    report_name = Path(unique_name).stem + "_report.csv"
                    report_path = OUTPUT_FOLDER / report_name

                    with open(
                        report_path, "w", newline="", encoding="utf-8"
                    ) as csv_file:
                        fields = ["violation", "confidence", "time_seconds"]
                        writer = csv.DictWriter(csv_file, fieldnames=fields)
                        writer.writeheader()
                        writer.writerows(violations)

                    results.append({
                        "filename": original_name,
                        "media_type": media_type,
                        "output": output_name,
                        "report": report_name,
                        "count": len(violations)
                    })

                except Exception as exc:
                    error = f"Could not process {original_name}: {exc}"

    return render_template("index.html", results=results, error=error)


@app.route("/outputs/<path:filename>")
def view_output(filename):
    from flask import send_from_directory
    return send_from_directory(str(OUTPUT_FOLDER.resolve()), filename)


if __name__ == "__main__":
    app.run(debug=True)
