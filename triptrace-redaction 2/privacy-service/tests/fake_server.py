"""Test double for the privacy gateway, used by api/test/redaction-flow.test.js.

Usage: python tests/fake_server.py <port> <mode>
  ok        a "face" is found in the middle of every image and masked
  crash     the face detector raises, so every image must be blocked
  notready  no detectors loaded (HTTP 503)
"""

import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app  # noqa: E402
from redaction import DOCUMENT, FACE, SCREEN, Region  # noqa: E402


class CenterFace:
    name, version, provides = "fake-face", "test", frozenset({FACE})

    def __init__(self, crash: bool) -> None:
        self.crash = crash

    def detect(self, image_bgr):
        if self.crash:
            raise RuntimeError("simulated detector crash")
        h, w = image_bgr.shape[:2]
        return [Region(FACE, "face", 0.99, (w * 0.4, h * 0.3, w * 0.6, h * 0.7))]


class NoObjects:
    name, version, provides = "fake-objects", "test", frozenset({SCREEN, DOCUMENT})

    def detect(self, image_bgr):
        return []


if __name__ == "__main__":
    port, mode = int(sys.argv[1]), sys.argv[2]
    detectors = None if mode == "notready" else [CenterFace(mode == "crash"), NoObjects()]
    uvicorn.run(create_app(detectors), host="127.0.0.1", port=port, log_level="warning")
