"""HTTP wrapper around the redaction core. Internal service: never expose it through nginx.

POST /v1/redact   body = raw JPEG/PNG bytes (Content-Type image/jpeg | image/png)
  200 {"status": "passed", "imageBase64": ..., "contentType": ..., "report": {...}}
  200 {"status": "failed", "reason": "...", "report": {...}}      (decided to block)
  413 / 415 / 503 {"status": "failed", "reason": "..."}           (could not process)
The caller treats anything other than a well-formed "passed" as a block.
"""

from __future__ import annotations

import base64
import logging
import os
import threading
from typing import Sequence

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from redaction import ALLOWED_FORMATS, Detector, redact_image

log = logging.getLogger("triptrace.privacy")
MAX_BODY_BYTES = 6 * 1024 * 1024  # a little above the API's 5 MB image limit


def _failed(status_code: int, reason: str) -> JSONResponse:
    return JSONResponse({"status": "failed", "reason": reason}, status_code=status_code)


def create_app(detectors: Sequence[Detector] | None) -> FastAPI:
    app = FastAPI(title="TripTrace privacy gateway", docs_url=None, redoc_url=None)
    lock = threading.Lock()  # detector models are not safe to call concurrently

    @app.get("/health")
    def health():
        if not detectors:
            return JSONResponse({"status": "not_ready"}, status_code=503)
        return {"status": "ok", "detectors": {d.name: d.version for d in detectors}}

    @app.post("/v1/redact")
    async def redact(request: Request):
        if not detectors:
            return _failed(503, "detectors_not_ready")
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in ALLOWED_FORMATS.values():
            return _failed(415, "unsupported_format")
        if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
            return _failed(413, "image_too_large")
        body = await request.body()
        if not body:
            return _failed(400, "empty_image")
        if len(body) > MAX_BODY_BYTES:
            return _failed(413, "image_too_large")

        with lock:
            result = redact_image(body, detectors)
        if result.status != "passed" or result.image_bytes is None:
            return {"status": "failed", "reason": result.reason or "internal_error", "report": result.report()}
        return {
            "status": "passed",
            "contentType": result.content_type,
            "imageBase64": base64.b64encode(result.image_bytes).decode("ascii"),
            "report": result.report(),
        }

    return app


def build_real_detectors() -> list[Detector]:
    from detectors import YoloVocabDetector, YuNetFaceDetector

    face_model = os.environ.get("PRIVACY_FACE_MODEL", "/models/face_detection_yunet_2023mar.onnx")
    object_model = os.environ.get("PRIVACY_OBJECT_MODEL", "/models/triptrace-vocab.pt")
    return [YuNetFaceDetector(face_model), YoloVocabDetector(object_model)]


def main_app() -> FastAPI:
    """Entry point for uvicorn: `uvicorn app:main_app --factory`."""
    logging.basicConfig(level=logging.INFO)
    try:
        detectors: list[Detector] | None = build_real_detectors()
    except Exception:  # noqa: BLE001 - stay up but report not-ready, so every upload is blocked
        log.exception("could not load detectors; serving 503 for every request")
        detectors = None
    return create_app(detectors)
