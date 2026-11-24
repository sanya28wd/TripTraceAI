"""TripTrace privacy gateway: redact sensitive regions from a cabin image before it is stored.

Design rules
------------
* Fail closed. Anything unexpected (undecodable file, detector crash, missing detector,
  mask that did not apply) returns status "failed" and NO image bytes. The caller must not
  store, forward or display the original.
* Detection and masking happen in memory. This module never writes to disk.
* Re-encoding drops EXIF/GPS/ICC metadata. Orientation is applied first, so detectors see
  the picture the right way up and the stored image keeps the same orientation.
* Output carries only counts, kinds, boxes and model versions: never pixels.

What it cannot do: detectors miss things. A "passed" result means "every configured
detector ran and every region it found was masked", not "no sensitive content remains".
Measure redaction recall on the privacy test set (execution guide, Phase 0/8).
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Protocol, Sequence

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

log = logging.getLogger("triptrace.redaction")

POLICY_VERSION = "2026-11-24.1"
MAX_PIXELS = 25_000_000
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}

# What a detector found. "person" is only used to derive a backup head region.
FACE, SCREEN, DOCUMENT, PERSON = "face", "screen", "document", "person"
REQUIRED_KINDS = frozenset({FACE, SCREEN, DOCUMENT})


@dataclass(frozen=True)
class Region:
    kind: str
    label: str
    confidence: float
    box: tuple[int, int, int, int]  # x1, y1, x2, y2 in pixels of the oriented image


class Detector(Protocol):
    name: str
    version: str
    provides: frozenset[str]  # kinds this detector is responsible for

    def detect(self, image_bgr: np.ndarray) -> list[Region]: ...


@dataclass(frozen=True)
class Policy:
    # Fractional padding added around each box before masking (masks should err large).
    padding: dict[str, float] = field(default_factory=lambda: {FACE: 0.35, SCREEN: 0.08, DOCUMENT: 0.12})
    # "fill" = solid black. "pixelate" = coarse mosaic: unreadable, but silhouette and colour
    # survive, so a phone left on a seat can still be recognised as a phone later.
    style: dict[str, str] = field(default_factory=lambda: {FACE: "fill", SCREEN: "pixelate", DOCUMENT: "fill"})
    pixelate_cells: int = 5  # cells along the longer side of the region
    person_head_fraction: float = 0.40  # top share of a person box masked as a backup for faces
    required_kinds: frozenset[str] = REQUIRED_KINDS


DEFAULT_POLICY = Policy()


@dataclass
class RedactionResult:
    status: str  # "passed" | "failed"
    reason: str | None = None
    image_bytes: bytes | None = None
    content_type: str | None = None
    width: int | None = None
    height: int | None = None
    regions: list[Region] = field(default_factory=list)
    detectors: dict[str, str] = field(default_factory=dict)

    def report(self) -> dict:
        counts: dict[str, int] = {}
        for region in self.regions:
            counts[region.kind] = counts.get(region.kind, 0) + 1
        return {
            "policyVersion": POLICY_VERSION,
            "detectors": self.detectors,
            "regionCounts": counts,
            "regions": [
                {"kind": r.kind, "label": r.label, "confidence": round(r.confidence, 3), "box": list(r.box)}
                for r in self.regions
            ],
            "width": self.width,
            "height": self.height,
        }


def _fail(reason: str, detectors: dict[str, str] | None = None) -> RedactionResult:
    return RedactionResult(status="failed", reason=reason, detectors=detectors or {})


def _decode(raw: bytes) -> tuple[np.ndarray, str] | str:
    """Returns (BGR array, format) or a failure reason string."""
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in ALLOWED_FORMATS:
                return "unsupported_format"
            if image.width * image.height > MAX_PIXELS:  # checked before pixels are decoded
                return "image_too_large"
            image.load()
            fmt = image.format
            oriented = ImageOps.exif_transpose(image)  # applies the EXIF rotation, returns a copy
            rgb = np.asarray(oriented.convert("RGB"))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return "decode_failed"
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), fmt


def _clamp_box(box: tuple[float, float, float, float], width: int, height: int) -> tuple[int, int, int, int] | None:
    x1, y1, x2, y2 = box
    if not all(np.isfinite([x1, y1, x2, y2])):
        return None
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))
    x1, y1 = max(0, int(np.floor(x1))), max(0, int(np.floor(y1)))
    x2, y2 = min(width, int(np.ceil(x2))), min(height, int(np.ceil(y2)))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def _mask_target(region: Region, policy: Policy, width: int, height: int) -> tuple[str, tuple[int, int, int, int]] | None:
    """Maps a detected region to (style, padded pixel box) to mask, or None if it is unusable."""
    x1, y1, x2, y2 = region.box
    if region.kind == PERSON:
        # Backup for faces the face detector missed (profile, partly hidden): mask the head area.
        kind = FACE
        y2 = y1 + (y2 - y1) * policy.person_head_fraction
        pad = policy.padding[FACE]
    elif region.kind in policy.padding:
        kind = region.kind
        pad = policy.padding[kind]
    else:
        return None
    bw, bh = x2 - x1, y2 - y1
    padded = (x1 - bw * pad, y1 - bh * pad, x2 + bw * pad, y2 + bh * pad)
    box = _clamp_box(padded, width, height)
    return None if box is None else (policy.style[kind], box)


def _apply_mask(image: np.ndarray, style: str, box: tuple[int, int, int, int], policy: Policy) -> None:
    x1, y1, x2, y2 = box
    patch = image[y1:y2, x1:x2]
    if style == "fill":
        patch[:] = 0
        return
    h, w = patch.shape[:2]
    long_side = max(h, w)
    cells_w = max(1, round(w * policy.pixelate_cells / long_side))
    cells_h = max(1, round(h * policy.pixelate_cells / long_side))
    small = cv2.resize(patch, (cells_w, cells_h), interpolation=cv2.INTER_AREA)
    patch[:] = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)


def _encode(image_bgr: np.ndarray, fmt: str) -> bytes:
    buffer = io.BytesIO()
    pil = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    # No exif=/icc_profile= arguments: nothing from the original file is carried over.
    if fmt == "JPEG":
        pil.save(buffer, "JPEG", quality=90, optimize=True)
    else:
        pil.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def redact_image(raw: bytes, detectors: Sequence[Detector], policy: Policy = DEFAULT_POLICY) -> RedactionResult:
    """Redacts one image. Never raises: every problem becomes a failed result without image bytes."""
    versions = {d.name: d.version for d in detectors}
    try:
        covered = frozenset().union(*(d.provides for d in detectors)) if detectors else frozenset()
        if not policy.required_kinds <= covered:
            return _fail("detector_missing", versions)

        decoded = _decode(raw)
        if isinstance(decoded, str):
            return _fail(decoded, versions)
        image, fmt = decoded
        height, width = image.shape[:2]

        found: list[Region] = []
        for detector in detectors:
            try:
                found.extend(detector.detect(image.copy()))  # a copy: a detector must not alter the source
            except Exception:  # noqa: BLE001 - any detector failure must block the image
                log.exception("detector %s failed", detector.name)
                return _fail(f"detector_error:{detector.name}", versions)

        masked: list[tuple[str, tuple[int, int, int, int]]] = []
        for region in found:
            target = _mask_target(region, policy, width, height)
            if target is None:
                if region.kind in policy.padding or region.kind == PERSON:
                    return _fail("invalid_detection", versions)  # a box we cannot place is not safe to ignore
                continue
            masked.append(target)

        # Mosaics first, solid fills last: a mosaic that overlaps a fill must not lighten it.
        output = image.copy()
        for style, box in sorted(masked, key=lambda item: item[0] == "fill"):
            _apply_mask(output, style, box, policy)

        # Do not trust the masking code: confirm every solid mask really is solid.
        for style, (x1, y1, x2, y2) in masked:
            if style == "fill" and np.any(output[y1:y2, x1:x2]):
                return _fail("mask_verification_failed", versions)

        encoded = _encode(output, fmt)
        return RedactionResult(
            status="passed",
            image_bytes=encoded,
            content_type=ALLOWED_FORMATS[fmt],
            width=width,
            height=height,
            regions=found,
            detectors=versions,
        )
    except Exception:  # noqa: BLE001 - last resort: fail closed
        log.exception("unexpected redaction failure")
        return _fail("internal_error", versions)
