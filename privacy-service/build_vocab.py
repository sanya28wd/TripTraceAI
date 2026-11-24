"""One-off build step: bake TripTrace's detection vocabulary into YOLO-World weights.

Run at image build time (see Dockerfile). Needs internet and the CLIP text encoder once; the
saved file then loads as a plain YOLO model, so the running service needs neither.

    python build_vocab.py /models/triptrace-vocab.pt
"""

import sys

from ultralytics import YOLOWorld

from detectors import VOCABULARY

output_path = sys.argv[1] if len(sys.argv) > 1 else "triptrace-vocab.pt"
model = YOLOWorld("yolov8s-worldv2.pt")
model.set_classes(list(VOCABULARY))
model.save(output_path)
print(f"Saved {output_path} with {len(VOCABULARY)} classes")
