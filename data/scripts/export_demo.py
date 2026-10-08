"""Export one explicitly privacy-approved development image as a lossless PNG.

Run: uv run --project data python data/scripts/export_demo.py SOURCE FREEZE IMAGE OUTPUT
IMAGE is the manifest-relative images/*.bmp name. OUTPUT is a new local folder.
No resizing, redaction, upload, or source writes; held-out images are rejected.
"""

import io
import json
import sys
from pathlib import Path
from typing import TypedDict, cast

from PIL import Image

from audit_leftincar import ImageRecord, checksum
from freeze_leftincar import Review


class ManifestRecord(TypedDict):
    source: ImageRecord
    review: Review


def export_demo(source: Path, frozen: Path, image: str, output: Path) -> None:
    """Discard embedded metadata and enforce C's existing five-MiB PNG limit."""
    records: list[ManifestRecord] = cast(list[ManifestRecord], json.loads((frozen / "development.json").read_text()))
    selected: list[ManifestRecord] = [r for r in records if r["source"]["image"] == image]
    if len(selected) != 1 or selected[0]["review"]["privacy"] != "approved":
        raise ValueError(f"Image must be a privacy-approved development member: {image}")
    if Path(image).parent != Path("images") or Path(image).suffix != ".bmp":
        raise ValueError(f"Invalid source image path: {image}")
    path: Path = (source / image).resolve(strict=True)
    if not path.is_relative_to(source) or checksum(path) != selected[0]["source"]["sha256"]:
        raise ValueError(f"Source changed or path escaped dataset: {image}")
    with Image.open(path) as original:
        rgb: Image.Image = original.convert("RGB")
        pixels: Image.Image = Image.frombytes("RGB", rgb.size, rgb.tobytes())
    buffer: io.BytesIO = io.BytesIO()
    pixels.save(buffer, format="PNG")
    if buffer.tell() > 5 * 1024 * 1024:
        raise ValueError(f"Lossless PNG exceeds API limit: {buffer.tell()} bytes; select another approved image")
    output.mkdir(parents=True, exist_ok=False)
    destination: Path = output / "leftincar-demo.png"
    destination.write_bytes(buffer.getvalue())
    with Image.open(destination) as exported:
        exported.load()
        if exported.tobytes() != pixels.tobytes() or exported.getexif() or exported.info:
            raise ValueError("PNG round-trip pixels or metadata check failed")
    (output / "provenance.json").write_text(json.dumps({
        "source_image": image, "source_sha256": selected[0]["source"]["sha256"],
        "png_sha256": checksum(destination), "size_bytes": destination.stat().st_size,
        "development_manifest_sha256": checksum(frozen / "development.json"),
    }, indent=2) + "\n")
    print(f"Exported privacy-approved development PNG: {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit("Usage: export_demo.py SOURCE FREEZE IMAGE OUTPUT (new directory)")
    export_demo(Path(sys.argv[1]).resolve(strict=True), Path(sys.argv[2]).resolve(strict=True), sys.argv[3], Path(sys.argv[4]).resolve())
