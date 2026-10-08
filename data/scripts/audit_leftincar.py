"""Audit immutable LeftInCAR inputs; output contains no image bytes or EXIF values.

Run: uv run --project data python data/scripts/audit_leftincar.py SOURCE OUTPUT
OUTPUT must not exist. Missing labels stay unresolved, never implicit negatives.
"""

import hashlib
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from typing import TypedDict

from PIL import Image


class Box(TypedDict):
    class_id: int
    x: float
    y: float
    width: float
    height: float


class ImageRecord(TypedDict):
    image: str
    sha256: str
    label: str | None
    label_sha256: str | None
    width: int
    height: int
    boxes: list[Box]
    capture_time: str
    metadata_keys: list[str]


SOURCE_CLASSES: tuple[str, ...] = (
    "smartphone", "laptop", "card", "suitcase", "wallet",
    "backpack", "clothing", "keys", "glasses", "handbag",
)


def checksum(path: Path) -> str:
    """Hash bytes without loading an entire source file into memory."""
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_boxes(path: Path) -> list[Box]:
    """Reject malformed, non-finite, unknown-class, or out-of-frame boxes."""
    boxes: list[Box] = []
    for number, line in enumerate(path.read_text().splitlines(), 1):
        fields: list[str] = line.split()
        if len(fields) != 5:
            raise ValueError(f"{path}:{number}: expected class and four coordinates")
        class_id: int = int(fields[0])
        x, y, width, height = map(float, fields[1:])
        if not (0 <= class_id < len(SOURCE_CLASSES) and
                all(math.isfinite(v) for v in (x, y, width, height)) and
                width > 0 and height > 0 and
                x - width / 2 >= -1e-6 and y - height / 2 >= -1e-6 and
                x + width / 2 <= 1.000001 and y + height / 2 <= 1.000001):
            raise ValueError(f"{path}:{number}: invalid class or bounding box: {line}")
        boxes.append(Box(class_id=class_id, x=x, y=y, width=width, height=height))
    return boxes


def inspect_image(source: Path, image: Path) -> ImageRecord:
    """Decode pixels and record metadata field names, never personal field values."""
    match: re.Match[str] | None = re.fullmatch(r"image__\d+_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})", image.stem)
    if match is None:
        raise ValueError(f"Unrecognized LeftInCAR capture filename: {image.name}")
    label: Path = source / "labels" / f"{image.stem}.txt"
    with Image.open(image) as pixels:
        pixels.load()
        width, height = pixels.size
        metadata_keys: list[str] = sorted(str(key) for key in pixels.info)
        metadata_keys += [f"exif:{key}" for key in pixels.getexif()]
    return ImageRecord(
        image=image.relative_to(source).as_posix(), sha256=checksum(image),
        label=label.relative_to(source).as_posix() if label.exists() else None,
        label_sha256=checksum(label) if label.exists() else None,
        width=width, height=height, boxes=read_boxes(label) if label.exists() else [],
        capture_time=match[1], metadata_keys=metadata_keys,
    )


def audit(source: Path, output: Path) -> None:
    """Inventory the entire flat source collection and fail on orphan annotations."""
    image_paths: list[Path] = sorted((source / "images").glob("*.bmp"))
    if not image_paths:
        raise ValueError(f"No BMP images found in {source / 'images'}")
    names: set[str] = {image.stem for image in image_paths}
    orphans: list[str] = [p.name for p in (source / "labels").glob("*.txt") if p.stem not in names]
    if orphans:
        raise ValueError(f"Orphan annotations: {orphans}")
    records: list[ImageRecord] = [inspect_image(source, image) for image in image_paths]
    hashes: Counter[str] = Counter(record["sha256"] for record in records)
    output.mkdir(parents=True, exist_ok=False)
    (output / "inventory.json").write_text(json.dumps(records, indent=2) + "\n")
    print(json.dumps({"images": len(records), "labels": sum(r["label"] is not None for r in records),
                      "boxes": sum(len(r["boxes"]) for r in records),
                      "duplicate_hashes": sum(count > 1 for count in hashes.values()),
                      "metadata_keys": sorted({key for r in records for key in r["metadata_keys"]})}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: audit_leftincar.py SOURCE OUTPUT (new directory)")
    audit(Path(sys.argv[1]).resolve(strict=True), Path(sys.argv[2]).resolve())
