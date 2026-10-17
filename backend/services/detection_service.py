"""
Detection service — runs the YOLO model on images and videos.

This module contains the core detection logic, adapted from the existing
working scripts (image_detect.py and video_detect.py). The YOLO model is
loaded once when this module is first imported, so inference is fast.
"""

import csv
from datetime import datetime, timezone
from pathlib import Path

import cv2
from ultralytics import YOLO

from backend.extensions import db
from backend.models.models import Analysis, Detection

# ---------------------------------------------------------------------------
# Model loading (happens once when the server starts)
# ---------------------------------------------------------------------------

_model = None


def get_model(model_path: str) -> YOLO:
    """Load the YOLO model once and reuse it for all requests."""
    global _model
    if _model is None:
        _model = YOLO(model_path)
    return _model


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

def process_image(
    analysis: Analysis,
    input_path: Path,
    output_path: Path,
    report_path: Path,
    model_path: str,
) -> None:
    """Analyze a single image using the PPE detection model.

    Steps:
      1. Run YOLO inference on the image.
      2. Save the annotated image with bounding boxes.
      3. Record each detection in the database.
      4. Write a CSV report of potential violations.
      5. Update the analysis record with results.
    """
    model = get_model(model_path)
    results = model.predict(source=str(input_path), conf=0.25, verbose=False)

    all_detections = []
    violations = []

    for result in results:
        # Save annotated image
        cv2.imwrite(str(output_path), result.plot())

        for box in result.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = model.names[class_id]
            is_violation = label.startswith("NO-")

            # Get bounding box coordinates
            coords = box.xyxy[0].tolist()

            detection = Detection(
                analysis_id=analysis.id,
                class_label=label,
                confidence=round(confidence, 4),
                is_violation=is_violation,
                bbox_x1=round(coords[0], 1),
                bbox_y1=round(coords[1], 1),
                bbox_x2=round(coords[2], 1),
                bbox_y2=round(coords[3], 1),
            )
            db.session.add(detection)
            all_detections.append(detection)

            if is_violation:
                violations.append({
                    "source_file": analysis.original_filename,
                    "media_type": "image",
                    "class_label": label,
                    "confidence": round(confidence, 4),
                    "frame_number": "",
                    "timestamp_seconds": "",
                })

    # Write CSV report
    _write_csv_report(report_path, violations)

    # Update analysis record
    analysis.total_detections = len(all_detections)
    analysis.violation_count = len(violations)
    analysis.annotated_filename = output_path.name
    analysis.report_filename = report_path.name
    analysis.status = "completed"
    analysis.completed_at = datetime.now(timezone.utc)

    db.session.commit()


# ---------------------------------------------------------------------------
# Video processing
# ---------------------------------------------------------------------------

def process_video(
    analysis: Analysis,
    input_path: Path,
    output_path: Path,
    report_path: Path,
    model_path: str,
) -> None:
    """Analyze a video file using the PPE detection model.

    Steps:
      1. Open the video with OpenCV.
      2. Run YOLO inference on each frame.
      3. Write annotated frames to the output video.
      4. Record each detection in the database.
      5. Write a CSV report of potential violations.
      6. Update the analysis record with results.

    This processes every frame, which can be slow for long videos.
    A progress indicator is provided by saving frame count periodically.
    """
    model = get_model(model_path)

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        cap.release()
        raise ValueError("Could not open the uploaded video.")

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if fps <= 0 or width <= 0 or height <= 0:
        cap.release()
        raise ValueError("The uploaded video has invalid properties.")

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        cap.release()
        raise ValueError("Could not create the output video.")

    all_detections = []
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
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    label = model.names[class_id]
                    is_violation = label.startswith("NO-")
                    timestamp = round((frame_number - 1) / fps, 2)

                    coords = box.xyxy[0].tolist()

                    detection = Detection(
                        analysis_id=analysis.id,
                        class_label=label,
                        confidence=round(confidence, 4),
                        is_violation=is_violation,
                        frame_number=frame_number,
                        timestamp_seconds=timestamp,
                        bbox_x1=round(coords[0], 1),
                        bbox_y1=round(coords[1], 1),
                        bbox_x2=round(coords[2], 1),
                        bbox_y2=round(coords[3], 1),
                    )
                    db.session.add(detection)
                    all_detections.append(detection)

                    if is_violation:
                        violations.append({
                            "source_file": analysis.original_filename,
                            "media_type": "video",
                            "class_label": label,
                            "confidence": round(confidence, 4),
                            "frame_number": frame_number,
                            "timestamp_seconds": timestamp,
                        })

    finally:
        cap.release()
        writer.release()

    # Write CSV report
    _write_csv_report(report_path, violations)

    # Calculate video duration
    duration = round(frame_number / fps, 2) if fps > 0 else 0

    # Update analysis record
    analysis.total_detections = len(all_detections)
    analysis.violation_count = len(violations)
    analysis.annotated_filename = output_path.name
    analysis.report_filename = report_path.name
    analysis.frame_count = frame_number
    analysis.duration_seconds = duration
    analysis.fps = round(fps, 2)
    analysis.status = "completed"
    analysis.completed_at = datetime.now(timezone.utc)

    db.session.commit()


# ---------------------------------------------------------------------------
# CSV report helper
# ---------------------------------------------------------------------------

def _write_csv_report(report_path: Path, violations: list[dict]) -> None:
    """Write a CSV file with detection results.

    Columns: source_file, media_type, class_label, confidence,
             frame_number, timestamp_seconds
    """
    fieldnames = [
        "source_file",
        "media_type",
        "class_label",
        "confidence",
        "frame_number",
        "timestamp_seconds",
    ]

    with open(report_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(violations)
