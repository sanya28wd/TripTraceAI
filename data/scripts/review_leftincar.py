"""Generate local-only annotated sheets and an unfinished per-image review CSV.

Run: uv run --project data python data/scripts/review_leftincar.py SOURCE AUDIT
CSV decisions: accept, no_item, exclude. Every row needs a reviewer, note and
visually confirmed group. Thumbnail sheets aid triage; inspect originals for
small objects and private text before accepting. No source pixels are changed.
"""

import csv
import json
import sys
from pathlib import Path
from typing import cast

from PIL import Image, ImageDraw, ImageFont

from audit_leftincar import ImageRecord, SOURCE_CLASSES, checksum


REVIEW_FIELDS: tuple[str, ...] = ("image", "decision", "group", "split", "privacy", "reviewer", "note")
COLORS: tuple[str, ...] = ("red", "lime", "cyan", "yellow", "magenta", "orange", "white", "pink", "skyblue", "violet")


def overlay(source: Path, record: ImageRecord) -> Image.Image:
    """Render source boxes on a bounded preview; the original remains untouched."""
    path: Path = source / record["image"]
    if checksum(path) != record["sha256"]:
        raise ValueError(f"Image changed since audit: {path}")
    with Image.open(path) as original:
        preview: Image.Image = original.convert("RGB")
    preview.thumbnail((1400, 1000))
    draw: ImageDraw.ImageDraw = ImageDraw.Draw(preview)
    font: ImageFont.FreeTypeFont = ImageFont.load_default(size=16)
    for box in record["boxes"]:
        left: float = (box["x"] - box["width"] / 2) * preview.width
        top: float = (box["y"] - box["height"] / 2) * preview.height
        right: float = (box["x"] + box["width"] / 2) * preview.width
        bottom: float = (box["y"] + box["height"] / 2) * preview.height
        color: str = COLORS[box["class_id"]]
        draw.rectangle((left, top, right, bottom), outline=color, width=2)
        draw.text((left, top), SOURCE_CLASSES[box["class_id"]], fill=color, font=font, stroke_width=1, stroke_fill="black")
    return preview


def build_review(source: Path, audit_dir: Path) -> None:
    """Keep all visual artifacts local and initialize decisions as pending."""
    records: list[ImageRecord] = cast(list[ImageRecord], json.loads((audit_dir / "inventory.json").read_text()))
    ordered: list[ImageRecord] = sorted(records, key=lambda r: r["capture_time"])
    review_dir: Path = audit_dir / "visual"
    review_dir.mkdir(exist_ok=False)
    font: ImageFont.FreeTypeFont = ImageFont.load_default(size=18)
    with (audit_dir / "review.csv").open("x", newline="") as stream:
        writer: csv.DictWriter[str] = csv.DictWriter(stream, fieldnames=REVIEW_FIELDS)
        writer.writeheader()
        for record in ordered:
            writer.writerow({"image": record["image"], "decision": "pending", "group": "", "split": "", "privacy": "not_approved", "reviewer": "", "note": ""})
    for start in range(0, len(ordered), 25):
        sheet: Image.Image = Image.new("RGB", (2500, 2250), "#eeeeee")
        draw: ImageDraw.ImageDraw = ImageDraw.Draw(sheet)
        for offset, record in enumerate(ordered[start:start + 25]):
            preview: Image.Image = overlay(source, record)
            preview.save(review_dir / f"{Path(record['image']).stem}.jpg", quality=95)
            preview.thumbnail((500, 400))
            x: int = (offset % 5) * 500
            y: int = (offset // 5) * 450
            sheet.paste(preview, (x, y + 45))
            draw.text((x + 4, y), f"{start + offset + 1:03} {Path(record['image']).stem}", font=font, fill="black")
            draw.text((x + 4, y + 22), f"{len(record['boxes'])} boxes / {'MISSING LABEL' if record['label'] is None else 'label present'}", font=font, fill="black")
        sheet.save(review_dir / f"sheet-{start // 25 + 1:02}.jpg", quality=95)
    print(f"Created {len(ordered)} previews and {(len(ordered) + 24) // 25} sheets; all decisions remain pending.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: review_leftincar.py SOURCE AUDIT")
    build_review(Path(sys.argv[1]).resolve(strict=True), Path(sys.argv[2]).resolve(strict=True))
