import base64
import io
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app  # noqa: E402
from redaction import DOCUMENT, FACE, PERSON, SCREEN, Region, redact_image  # noqa: E402


class Fake:
    """Detector that returns fixed regions and claims to cover the given kinds."""

    def __init__(self, name, provides, regions=(), error=None):
        self.name, self.version, self.provides = name, "test", frozenset(provides)
        self._regions, self._error = list(regions), error

    def detect(self, image_bgr):
        if self._error:
            raise self._error
        return list(self._regions)


def make_image(fmt="JPEG", size=(200, 100), exif=False, color=(200, 120, 40)):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    if exif and fmt == "JPEG":
        data = Image.Exif()
        data[0x010F] = "SecretCameraMaker"  # Make
        image.save(buffer, "JPEG", exif=data)
    else:
        image.save(buffer, fmt)
    return buffer.getvalue()


def pixels(result):
    return np.asarray(Image.open(io.BytesIO(result.image_bytes)).convert("RGB"))


FACE_DET = lambda *r, **k: Fake("face", {FACE}, r, **k)  # noqa: E731
OBJ_DET = lambda *r, **k: Fake("obj", {SCREEN, DOCUMENT}, r, **k)  # noqa: E731


def test_face_is_pixelated_with_padding():
    face = Region(FACE, "face", 0.9, (80, 30, 120, 70))
    result = redact_image(make_image("PNG"), [FACE_DET(face), OBJ_DET()])
    assert result.status == "passed"
    out = pixels(result)
    assert len(np.unique(out[24:76, 74:126].reshape(-1, 3), axis=0)) <= 25  # 5x5 mosaic cells
    assert out[2, 2].tolist() == [200, 120, 40]  # untouched corner


def test_document_filled_and_screen_pixelated_not_black():
    doc = Region(DOCUMENT, "passport", 0.8, (10, 10, 60, 50))
    screen = Region(SCREEN, "phone screen", 0.8, (100, 20, 190, 90))
    result = redact_image(make_image("PNG"), [FACE_DET(), OBJ_DET(doc, screen)])
    out = pixels(result)
    assert (out[10:50, 10:60] == 0).all()
    assert out[55:85, 110:180].any()  # mosaic keeps colour, so a phone stays recognisable


def test_pixelate_destroys_fine_detail():
    rng = np.random.default_rng(0)
    noisy = Image.fromarray(rng.integers(0, 256, (120, 200, 3), dtype=np.uint8))
    buffer = io.BytesIO()
    noisy.save(buffer, "PNG")
    screen = Region(SCREEN, "phone", 0.9, (20, 20, 180, 100))
    result = redact_image(buffer.getvalue(), [FACE_DET(), OBJ_DET(screen)])
    out = pixels(result)[24:96, 30:170]  # interior, away from edges
    assert len(np.unique(out.reshape(-1, 3), axis=0)) <= 40  # a handful of mosaic cells, not noise


def test_person_gets_head_region_masked():
    person = Region(PERSON, "person", 0.7, (50, 10, 150, 90))
    result = redact_image(make_image("PNG"), [FACE_DET(), OBJ_DET(person)])
    out = pixels(result)
    assert len(np.unique(out[5:49, 35:166].reshape(-1, 3), axis=0)) <= 25  # padded head is pixelated
    assert out[88, 60].tolist() == [200, 120, 40]  # the body below the head is left alone


def test_overlapping_mosaic_does_not_lighten_fill():
    document = Region(DOCUMENT, "id card", 0.9, (80, 30, 120, 70))
    screen = Region(SCREEN, "phone", 0.9, (60, 20, 140, 80))
    result = redact_image(make_image("PNG"), [FACE_DET(), OBJ_DET(document, screen)])
    assert result.status == "passed"
    assert (pixels(result)[30:70, 80:120] == 0).all()


def test_exif_is_stripped():
    original = make_image("JPEG", exif=True)
    assert Image.open(io.BytesIO(original)).getexif().get(0x010F) == "SecretCameraMaker"
    result = redact_image(original, [FACE_DET(), OBJ_DET()])
    assert result.status == "passed"
    assert not dict(Image.open(io.BytesIO(result.image_bytes)).getexif())


def test_exif_orientation_applied_before_detection():
    image = Image.new("RGB", (200, 100), (10, 20, 30))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise when displayed
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    seen = {}

    class Spy(Fake):
        def detect(self, image_bgr):
            seen["shape"] = image_bgr.shape[:2]
            return []

    result = redact_image(buffer.getvalue(), [Spy("face", {FACE}), OBJ_DET()])
    assert seen["shape"] == (200, 100)  # detectors saw the upright image
    assert (result.width, result.height) == (100, 200)


def test_detector_exception_fails_closed_without_bytes():
    result = redact_image(make_image(), [FACE_DET(error=RuntimeError("boom")), OBJ_DET()])
    assert result.status == "failed"
    assert result.reason == "detector_error:face"
    assert result.image_bytes is None


def test_missing_detector_kind_fails_closed():
    result = redact_image(make_image(), [FACE_DET()])  # nothing covers screens or documents
    assert (result.status, result.reason) == ("failed", "detector_missing")
    assert redact_image(make_image(), []).reason == "detector_missing"


@pytest.mark.parametrize("raw,reason", [(b"not an image", "decode_failed"), (b"", "decode_failed")])
def test_undecodable_input_fails(raw, reason):
    result = redact_image(raw, [FACE_DET(), OBJ_DET()])
    assert (result.status, result.reason) == ("failed", reason)


def test_unsupported_format_fails():
    result = redact_image(make_image("GIF"), [FACE_DET(), OBJ_DET()])
    assert result.reason == "unsupported_format"


def test_oversized_image_fails_before_decoding():
    big = Image.new("L", (6000, 5000))  # 30 MP, over the 25 MP cap; compresses to almost nothing
    buffer = io.BytesIO()
    big.save(buffer, "PNG")
    result = redact_image(buffer.getvalue(), [FACE_DET(), OBJ_DET()])
    assert result.reason == "image_too_large"


def test_nan_box_fails_closed():
    bad = Region(FACE, "face", 0.9, (float("nan"), 0, 10, 10))
    result = redact_image(make_image(), [FACE_DET(bad), OBJ_DET()])
    assert (result.status, result.reason) == ("failed", "invalid_detection")


def test_box_outside_image_is_clamped():
    face = Region(FACE, "face", 0.9, (-50, -50, 30, 30))
    result = redact_image(make_image("PNG"), [FACE_DET(face), OBJ_DET()])
    assert result.status == "passed"
    assert (pixels(result)[0:30, 0:30] == 0).all()


def test_report_has_counts_and_no_pixels():
    regions = [Region(FACE, "face", 0.9, (80, 30, 120, 70)), Region(DOCUMENT, "id card", 0.5, (5, 5, 30, 30))]
    report = redact_image(make_image(), [FACE_DET(regions[0]), OBJ_DET(regions[1])]).report()
    assert report["regionCounts"] == {"face": 1, "document": 1}
    assert report["detectors"] == {"face": "test", "obj": "test"}
    assert "imageBase64" not in report


# ---- HTTP layer ----

def client(detectors):
    return TestClient(create_app(detectors))


def test_api_passed_returns_redacted_image():
    face = Region(FACE, "face", 0.9, (80, 30, 120, 70))
    response = client([FACE_DET(face), OBJ_DET()]).post("/v1/redact", content=make_image("PNG"), headers={"Content-Type": "image/png"})
    body = response.json()
    assert response.status_code == 200 and body["status"] == "passed"
    out = np.asarray(Image.open(io.BytesIO(base64.b64decode(body["imageBase64"]))).convert("RGB"))
    assert (out[30:70, 80:120] == 0).all()


def test_api_failed_has_no_image():
    response = client([FACE_DET(error=RuntimeError("x")), OBJ_DET()]).post("/v1/redact", content=make_image(), headers={"Content-Type": "image/jpeg"})
    assert response.json()["status"] == "failed"
    assert "imageBase64" not in response.json()


def test_api_not_ready_is_503_and_health_agrees():
    app = client(None)
    assert app.get("/health").status_code == 503
    response = app.post("/v1/redact", content=make_image(), headers={"Content-Type": "image/jpeg"})
    assert response.status_code == 503 and response.json()["reason"] == "detectors_not_ready"


def test_api_rejects_wrong_type_and_empty_body():
    app = client([FACE_DET(), OBJ_DET()])
    assert app.post("/v1/redact", content=b"x", headers={"Content-Type": "text/plain"}).status_code == 415
    assert app.post("/v1/redact", content=b"", headers={"Content-Type": "image/png"}).status_code == 400
