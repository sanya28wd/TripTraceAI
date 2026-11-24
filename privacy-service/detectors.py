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

from redaction import DOCUMENT, FACE, PERSON, PHONE, PHONE_SCREEN, SCREEN, Region


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
        # Low threshold on purpose: a false face costs a coarse mosaic, a miss costs privacy.
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
    # Keep the phone body available as item evidence. Only prompts for an illuminated
    # display are privacy regions; the phone class itself is deliberately never masked.
    "phone": PHONE,
    "illuminated phone screen": PHONE_SCREEN,
    "lit smartphone screen showing content": PHONE_SCREEN,
    "phone screen displaying content": PHONE_SCREEN,
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

    def __init__(self, model_path: str, confidence: float = 0.35, image_size: int = 1280) -> None:
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
        # A reflective mirror can look like a lit screen to an open-vocabulary detector.
        # Accept phone-screen boxes only when they sit inside a detected phone body and
        # occupy less than nearly all of that phone. This also prevents broad scene boxes
        # from being pixelated while preserving the phone for item recognition.
        phones = [region for region in regions if region.kind == PHONE]
        screen_candidates = [region for region in regions if region.kind == PHONE_SCREEN]
        accepted_screens: list[Region] = []
        for screen in screen_candidates:
            sx1, sy1, sx2, sy2 = screen.box
            screen_area = max(0.0, sx2 - sx1) * max(0.0, sy2 - sy1)
            if screen_area == 0:
                continue
            for phone in phones:
                px1, py1, px2, py2 = phone.box
                phone_area = max(0.0, px2 - px1) * max(0.0, py2 - py1)
                if phone_area == 0 or screen_area > phone_area * 0.9:
                    continue
                ix1, iy1 = max(sx1, px1), max(sy1, py1)
                ix2, iy2 = min(sx2, px2), min(sy2, py2)
                intersection_area = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
                if intersection_area / screen_area >= 0.75:
                    accepted_screens.append(Region(
                        SCREEN, screen.label, screen.confidence,
                        (ix1, iy1, ix2, iy2),
                    ))
                    break
        return [region for region in regions if region.kind != PHONE_SCREEN] + accepted_screens
