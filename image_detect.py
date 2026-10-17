
import csv
from datetime import datetime
from pathlib import Path
from ultralytics import YOLO
import cv2

# Find JPG, JPEG, and PNG images
image_folder = Path("images")

image_files = (
    list(image_folder.glob("*.jpg"))
    + list(image_folder.glob("*.jpeg"))
    + list(image_folder.glob("*.png"))
)

if not image_files:
    print("No images found in the images folder.")
    exit()

# Load PPE model
model = YOLO("best.pt")

print("PPE classes supported:")
print(model.names)

# Store all detected violations
violations = []

# Process each image
for image_path in image_files:
    print(f"\nProcessing: {image_path.name}")

    results = model.predict(source=str(image_path), conf=0.25)

    for result in results:
        # Draw and save detection boxes
        annotated_image = result.plot()

        output_path = Path("outputs") / f"detected_{image_path.stem}.jpg"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), annotated_image)

        # Check detected objects
        for box in result.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = model.names[class_id]

            print(f"Object: {label} | Confidence: {confidence:.2f}")

            # Record detected PPE violations
            if label.startswith("NO-"):
                violations.append({
                    "image": image_path.name,
                    "violation": label,
                    "confidence": round(confidence, 2),
                    "timestamp": datetime.now().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
                })

# Save one report containing violations from all images
report_path = Path("outputs/violation_report.csv")
report_path.parent.mkdir(parents=True, exist_ok=True)

with open(report_path, "w", newline="", encoding="utf-8") as file:
    fieldnames = ["image", "violation", "confidence", "timestamp"]
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(violations)

print(f"\nViolation report saved to: {report_path}")
print("Detection completed. Check the outputs folder.")
