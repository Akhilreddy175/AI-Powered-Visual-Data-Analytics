"""
Detection service — runs the YOLO model on images and videos.

This module contains the core detection logic, adapted from the existing
working scripts (image_detect.py and video_detect.py). The YOLO model is
loaded once when this module is first imported, so inference is fast.

Key fixes applied:
  - Confidence threshold lowered from 0.25 → 0.15 so borderline detections
    like NO-Hardhat (which the model may score ~0.18–0.22) are not silently
    discarded.  Users can see the actual confidence score and judge themselves.
  - CSV report contains violations only (NO-* classes). All detections are
    stored in the database for analytics, but the report only shows violations.
  - Video output uses H.264 (avc1) codec instead of mp4v for browser
    compatibility. Falls back to ffmpeg re-encoding if avc1 is unavailable.
"""

import csv
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

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
      1. Run YOLO inference on the image (conf threshold = 0.15).
      2. Save the annotated image with bounding boxes.
      3. Record every detection in the database.
      4. Write a CSV report of ALL detections with is_violation flag.
      5. Update the analysis record with results.
    """
    model = get_model(model_path)

    # Threshold 0.15: wide enough to catch borderline violations (e.g.
    # NO-Hardhat at ~0.18) while filtering obvious noise.
    results = model.predict(source=str(input_path), conf=0.15, verbose=False)

    all_detections = []
    report_rows = []

    for result in results:
        # Save annotated image with bounding boxes
        cv2.imwrite(str(output_path), result.plot())

        for box in result.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = model.names[class_id]
            is_violation = label.startswith("NO-")

            # Bounding box coordinates
            coords = box.xyxy[0].tolist()

            # Store in database
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

            # Every detection goes into the CSV report.
            # 'is_violation' = YES means the model flagged a PPE violation.
            # 'is_violation' = NO means compliant PPE or other detected object.
            report_rows.append({
                "source_file": analysis.original_filename,
                "media_type": "image",
                "class_label": label,
                "confidence": round(confidence, 4),
                "is_violation": "YES" if is_violation else "NO",
                "frame_number": "",
                "timestamp_seconds": "",
            })

    violation_count = sum(1 for r in report_rows if r["is_violation"] == "YES")

    # Write CSV — violations only (compliant items stay in the database for analytics)
    violations_only = [r for r in report_rows if r["is_violation"] == "YES"]
    _write_csv_report(report_path, violations_only)

    # Update analysis record
    analysis.total_detections = len(all_detections)
    analysis.violation_count = violation_count
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
      2. Run YOLO inference on each frame (conf threshold = 0.15).
      3. Write annotated frames to the output video.
      4. Record every detection in the database.
      5. Write a CSV report of ALL detections with is_violation flag.
      6. Update the analysis record with results.
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

    # Try H.264 (avc1) first — required for browser <video> playback.
    # mp4v (MPEG-4 Part 2) produces files that browsers cannot decode.
    # avc1 (H.264) support in OpenCV depends on the build; if it fails we
    # write mp4v and re-encode with ffmpeg afterwards.
    fourcc_h264 = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(str(output_path), fourcc_h264, fps, (width, height))
    using_h264 = writer.isOpened()

    if not using_h264:
        # avc1 not supported in this OpenCV build — use mp4v and re-encode later
        log.warning("avc1 codec not available; falling back to mp4v + ffmpeg re-encode")
        writer.release()
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
    report_rows = []
    frame_number = 0

    try:
        while True:
            success, frame = cap.read()
            if not success:
                break

            frame_number += 1
            # Same lower threshold for video frames
            results = model.predict(frame, conf=0.15, verbose=False)

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

                    # All detections in report; violations clearly marked
                    report_rows.append({
                        "source_file": analysis.original_filename,
                        "media_type": "video",
                        "class_label": label,
                        "confidence": round(confidence, 4),
                        "is_violation": "YES" if is_violation else "NO",
                        "frame_number": frame_number,
                        "timestamp_seconds": timestamp,
                    })

    finally:
        cap.release()
        writer.release()

    # If we fell back to mp4v, try to re-encode to H.264 with ffmpeg so the
    # browser <video> tag can actually play the file.
    if not using_h264:
        _reencode_video_h264(output_path)

    violation_count = sum(1 for r in report_rows if r["is_violation"] == "YES")

    # Write CSV — violations only (compliant items stay in the database for analytics)
    violations_only = [r for r in report_rows if r["is_violation"] == "YES"]
    _write_csv_report(report_path, violations_only)

    # Calculate video duration
    duration = round(frame_number / fps, 2) if fps > 0 else 0


    # Update analysis record
    analysis.total_detections = len(all_detections)
    analysis.violation_count = violation_count
    analysis.annotated_filename = output_path.name
    analysis.report_filename = report_path.name
    analysis.frame_count = frame_number
    analysis.duration_seconds = duration
    analysis.fps = round(fps, 2)
    analysis.status = "completed"
    analysis.completed_at = datetime.now(timezone.utc)

    db.session.commit()


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Video re-encoding helper (mp4v → H.264 via ffmpeg)
# ---------------------------------------------------------------------------

def _reencode_video_h264(output_path: Path) -> None:
    """Re-encode a video from mp4v (MPEG-4 Part 2) to H.264 using ffmpeg.

    Browsers require H.264 for inline <video> playback. OpenCV's mp4v codec
    produces a file that VLC can open but Chrome/Firefox/Safari cannot decode.

    This function is a best-effort conversion: if ffmpeg is not installed or
    the re-encoding fails for any reason, we log a warning and leave the
    original mp4v file in place. The analysis still succeeds; the video just
    won't be playable directly in the browser preview.
    """
    temp_path = output_path.with_suffix(".tmp.mp4")
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(output_path),
                "-vcodec", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-acodec", "aac",
                "-movflags", "+faststart",
                str(temp_path),
            ],
            capture_output=True,
            timeout=300,  # 5-minute timeout for large videos
        )
        if result.returncode == 0 and temp_path.exists():
            output_path.unlink()
            temp_path.rename(output_path)
            log.info("Re-encoded video to H.264: %s", output_path.name)
        else:
            # ffmpeg ran but failed — keep original mp4v, clean up temp
            stderr = result.stderr.decode(errors="replace")
            log.warning("ffmpeg re-encode failed (code %d): %s", result.returncode, stderr[-500:])
            if temp_path.exists():
                temp_path.unlink()
    except FileNotFoundError:
        log.warning("ffmpeg not found — video saved as mp4v (may not play in browser).")
        if temp_path.exists():
            temp_path.unlink()
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg re-encode timed out — keeping mp4v output.")
        if temp_path.exists():
            temp_path.unlink()
    except Exception as exc:
        log.warning("Unexpected error during ffmpeg re-encode: %s", exc)
        if temp_path.exists():
            temp_path.unlink()


# ---------------------------------------------------------------------------
# CSV report helper
# ---------------------------------------------------------------------------

def _write_csv_report(report_path: Path, rows: list[dict]) -> None:
    """Write a CSV file with ALL detection results.

    Columns:
      source_file       — original uploaded filename
      media_type        — 'image' or 'video'
      class_label       — what the model detected (e.g. 'NO-Hardhat', 'Safety Vest')
      confidence        — model confidence score (0.0 – 1.0); higher = more certain
      is_violation      — 'YES' if this is a potential safety violation, 'NO' otherwise
      frame_number      — video only: frame where detection occurred
      timestamp_seconds — video only: time in seconds
    """
    fieldnames = [
        "source_file",
        "media_type",
        "class_label",
        "confidence",
        "is_violation",
        "frame_number",
        "timestamp_seconds",
    ]

    with open(report_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
