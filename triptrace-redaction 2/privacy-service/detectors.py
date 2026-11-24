"""Real detectors for the privacy gateway.

Both load a model file at startup and raise if it is missing, so a misconfigured service stays
"not ready" (HTTP 503) instead of silently redacting nothing.

NOT exercised in the build sandbox (model downloads were blocked there). Run
`python -m pytest tests` and then the redaction-recall check on your privacy test images
before relying on them.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import numpy as np

from redaction import DOCUMENT, FACE, PERSON, SCREEN, Region


def _file_version(path: str) -> str:
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()[:10]
    return f"{Path(path).name}@{digest}"


class YuNetFaceDetector:
    """OpenCV's YuNet face detector (ONNX). Small, CPU-friendly, handles small and tilted faces."""

    name = "yunet-face"
    provides = frozenset({FACE})

    def __init__(self, model_path: str, score_threshold: float = 0.5) -> None:
        import cv2

        if not os.path.isfile(model_path):
            raise FileNotFoundError(f"YuNet model not found: {model_path}")
        self._cv2 = cv2
        # Low threshold on purpose: for redaction a false face costs a black box, a miss costs privacy.
        self._detector = cv2.FaceDetectorYN.create(model_path, "", (320, 320), score_threshold, 0.3, 5000)
        self.version = _file_version(model_path)

    def detect(self, image_bgr: np.ndarray) -> list[Region]:
        height, width = image_bgr.shape[:2]
        self._detector.setInputSize((width, height))
        _, faces = self._detector.detect(image_bgr)
        if faces is None:
            return []
        # Row layout: x, y, w, h, 10 landmark values, score.
        return [
            Region(FACE, "face", float(row[-1]), (row[0], row[1], row[0] + row[2], row[1] + row[3]))
            for row in faces
        ]


# One open-vocabulary detector covers everything COCO classes miss (passports, ID cards, paper).
# Prompts are baked into the weights by build_vocab.py, so no text encoder is needed at runtime.
VOCABULARY: dict[str, str] = {
    "person": PERSON,
    "phone": SCREEN,
    "phone screen": SCREEN,
    "tablet": SCREEN,
    "laptop": SCREEN,
    "laptop screen": SCREEN,
    "passport": DOCUMENT,
    "id card": DOCUMENT,
    "driving licence": DOCUMENT,
    "credit card": DOCUMENT,
    "paper document": DOCUMENT,
    "sheet of paper": DOCUMENT,
    "book": DOCUMENT,
}


class YoloVocabDetector:
    """YOLO-World weights with TripTrace's vocabulary saved in (see build_vocab.py)."""

    name = "yolo-world-triptrace"
    provides = frozenset({SCREEN, DOCUMENT})

    def __init__(self, model_path: str, confidence: float = 0.15, image_size: int = 1280) -> None:
        if not os.path.isfile(model_path):
            raise FileNotFoundError(f"Object model not found: {model_path}")
        from ultralytics import YOLO

        self._model = YOLO(model_path)
        self._confidence = confidence  # low on purpose, same reasoning as the face threshold
        self._image_size = image_size
        self.version = _file_version(model_path)

    def detect(self, image_bgr: np.ndarray) -> list[Region]:
        result = self._model.predict(image_bgr, conf=self._confidence, imgsz=self._image_size, verbose=False)[0]
        names = result.names
        regions: list[Region] = []
        for box in result.boxes:
            label = names[int(box.cls)]
            kind = VOCABULARY.get(label)
            if kind is None:
                continue
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            regions.append(Region(kind, label, float(box.conf), (x1, y1, x2, y2)))
        return regions
