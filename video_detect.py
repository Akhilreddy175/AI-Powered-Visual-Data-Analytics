
import csv
from pathlib import Path

import cv2
from ultralytics import YOLO

# Folders
video_folder = Path("images")
output_folder = Path("outputs")
output_folder.mkdir(parents=True, exist_ok=True)

# Supported video formats
video_extensions = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}

# Find all videos in the images folder
video_files = sorted(
    file for file in video_folder.iterdir()
    if file.is_file() and file.suffix.lower() in video_extensions
)

if not video_files:
    print("No videos found in the images folder.")
    raise SystemExit

# Load the PPE detection model once
model = YOLO("best.pt")

print(f"Found {len(video_files)} video(s).")

# Process each video
for video_path in video_files:
    print(f"\nProcessing: {video_path.name}")

    output_video = output_folder / f"detected_{video_path.stem}.mp4"
    output_report = output_folder / f"{video_path.stem}_violation_report.csv"

    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        print(f"Could not open {video_path.name}. Skipping.")
        cap.release()
        continue

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if fps <= 0 or width <= 0 or height <= 0:
        print(f"Invalid video information for {video_path.name}. Skipping.")
        cap.release()
        continue

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(
        str(output_video), fourcc, fps, (width, height)
    )

    if not writer.isOpened():
        print(f"Could not create output for {video_path.name}.")
        cap.release()
        continue

    violations = []
    frame_number = 0

    while True:
        success, frame = cap.read()

        if not success:
            break

        frame_number += 1

        results = model.predict(frame, conf=0.25, verbose=False)

        for result in results:
            annotated_frame = result.plot()
            writer.write(annotated_frame)

            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                label = model.names[class_id]

                if label.startswith("NO-"):
                    violations.append({
                        "video": video_path.name,
                        "frame": frame_number,
                        "time_seconds": round((frame_number - 1) / fps, 2),
                        "violation": label,
                        "confidence": round(confidence, 2)
                    })

        if frame_number % 30 == 0:
            print(f"  Processed {frame_number} frames")

    cap.release()
    writer.release()

    # Save a separate report for this video
    with open(output_report, "w", newline="", encoding="utf-8") as file:
        fields = [
            "video", "frame", "time_seconds",
            "violation", "confidence"
        ]

        csv_writer = csv.DictWriter(file, fieldnames=fields)
        csv_writer.writeheader()
        csv_writer.writerows(violations)

    print(f"  Annotated video: {output_video}")
    print(f"  Violation report: {output_report}")
    print(f"  Violation detections: {len(violations)}")

print("\nAll videos processed.")
