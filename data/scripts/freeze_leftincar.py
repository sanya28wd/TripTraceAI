"""Freeze reviewed labels and split manifests without copying original images.

Run: uv run --project data python data/scripts/freeze_leftincar.py SOURCE AUDIT OUTPUT
Complete review.csv first: decision=accept|no_item|exclude, group, split=
development|held_out (blank for excluded), reviewer and note. 'no_item' means
no LeftInCAR target class, not a universal empty-cabin claim. Freeze rejects
unresolved cards, stale inputs, pending decisions and group/duplicate leakage.
OUTPUT must not exist. This command never uploads data or rewrites source files.
"""

import csv
import json
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import TypedDict, cast

from audit_leftincar import ImageRecord, SOURCE_CLASSES, checksum, inspect_image, validate_source_classes


class Review(TypedDict):
    image: str
    decision: str
    group: str
    split: str
    privacy: str
    reviewer: str
    note: str


CATEGORY_MAP: dict[str, str | None] = {
    "smartphone": "phone", "laptop": "electronics_large", "card": None,
    "suitcase": "bag", "wallet": "wallet", "backpack": "bag",
    "clothing": "clothing_accessory", "keys": "keys",
    "glasses": "clothing_accessory", "handbag": "bag",
}


def read_reviews(path: Path, records: list[ImageRecord]) -> list[Review]:
    """Require one explicit reviewed outcome per audited image."""
    with path.open(newline="") as stream:
        reader: csv.DictReader[str] = csv.DictReader(stream)
        if reader.fieldnames != ["image", "decision", "group", "split", "privacy", "reviewer", "note"]:
            raise ValueError("Review CSV requires image, decision, group, split, privacy, reviewer, note columns")
        raw_rows: list[dict[str, str]] = list(reader)
        if any(None in row or any(value is None for value in row.values()) for row in raw_rows):
            raise ValueError("Review CSV has missing or extra fields")
        rows: list[Review] = cast(list[Review], raw_rows)
    names: list[str] = [row["image"] for row in rows]
    if len(names) != len(set(names)) or set(names) != {r["image"] for r in records}:
        raise ValueError("Review CSV must cover each audited image exactly once")
    by_name: dict[str, ImageRecord] = {r["image"]: r for r in records}
    for row in rows:
        if row["decision"] not in {"accept", "no_item", "exclude"} or not all(
            row[key].strip() for key in ("group", "reviewer", "note")
        ):
            raise ValueError(f"Unfinished review: {row['image']}")
        if row["privacy"] not in {"approved", "not_approved"}:
            raise ValueError(f"Invalid privacy approval: {row['image']}")
        record: ImageRecord = by_name[row["image"]]
        if row["decision"] == "exclude":
            if row["split"] or row["privacy"] == "approved":
                raise ValueError(f"Excluded image cannot have a split: {row['image']}")
            continue
        if row["split"] not in {"development", "held_out"}:
            raise ValueError(f"Missing or invalid split: {row['image']}")
        if row["decision"] == "no_item" and record["boxes"]:
            raise ValueError(f"Negative image has target boxes: {row['image']}")
        if row["decision"] == "accept" and (record["label"] is None or not record["boxes"]):
            raise ValueError(f"Accepted positive needs source annotations: {row['image']}")
        if any(CATEGORY_MAP[SOURCE_CLASSES[b["class_id"]]] is None for b in record["boxes"]):
            raise ValueError(f"Unresolved card mapping; exclude pending review: {row['image']}")
    return rows


def validate_splits(records: list[ImageRecord], rows: list[Review]) -> None:
    """Enforce disjoint images, source-byte duplicates and reviewed capture groups."""
    reviews: dict[str, Review] = {row["image"]: row for row in rows}
    groups: dict[str, set[str]] = {}
    duplicates: dict[str, set[str]] = {}
    coverage: dict[str, set[int]] = {"development": set(), "held_out": set()}
    negatives: Counter[str] = Counter()
    counts: Counter[str] = Counter()
    for record in records:
        row: Review = reviews[record["image"]]
        if row["decision"] == "exclude":
            continue
        counts[row["split"]] += 1
        groups.setdefault(row["group"], set()).add(row["split"])
        duplicates.setdefault(record["sha256"], set()).add(row["split"])
        coverage[row["split"]].update(b["class_id"] for b in record["boxes"])
        negatives[row["split"]] += row["decision"] == "no_item"
    if any(len(splits) > 1 for splits in (*groups.values(), *duplicates.values())):
        raise ValueError("Capture group or exact duplicate crosses development/held-out")
    if not all(coverage.values()) or coverage["development"] != coverage["held_out"]:
        raise ValueError(f"Both splits must cover every accepted source class: {coverage}")
    fraction: float = counts["held_out"] / sum(counts.values())
    if not 0.15 <= fraction <= 0.25:
        raise ValueError(f"Held-out fraction must be 15–25% around the 20% target: {fraction:.3f}")
    if not all(negatives[split] > 0 for split in coverage):
        raise ValueError("Both splits require visually verified source negatives")


def freeze(source: Path, audit_dir: Path, output: Path) -> None:
    """Validate current bytes, then publish a new immutable artifact directory."""
    validate_source_classes(source)
    if output.exists():
        raise FileExistsError(f"Freeze already exists; do not overwrite: {output}")
    records: list[ImageRecord] = cast(list[ImageRecord], json.loads((audit_dir / "inventory.json").read_text()))
    rows: list[Review] = read_reviews(audit_dir / "review.csv", records)
    validate_splits(records, rows)
    current: list[ImageRecord] = [inspect_image(source, p) for p in sorted((source / "images").glob("*.bmp"))]
    if records != current:
        raise ValueError("Source images, annotations or inventory changed; rerun audit and review")
    reviews: dict[str, Review] = {row["image"]: row for row in rows}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as directory:
        staging: Path = Path(directory) / "freeze"
        staging.mkdir()
        (staging / "labels").mkdir()
        counts: Counter[str] = Counter()
        for split in ("development", "held_out", "excluded"):
            selected: list[ImageRecord] = [r for r in records if
                (reviews[r["image"]]["decision"] == "exclude" if split == "excluded" else
                 reviews[r["image"]]["split"] == split)]
            counts[split] = len(selected)
            (staging / f"{split}.json").write_text(json.dumps([{"source": r, "review": reviews[r["image"]]} for r in selected], indent=2) + "\n")
            if split == "excluded":
                continue
            for record in selected:
                destination: Path = staging / "labels" / f"{Path(record['image']).stem}.txt"
                if record["label"] is None:
                    destination.write_text("")
                else:
                    shutil.copyfile(source / record["label"], destination)
        shutil.copyfile(audit_dir / "review.csv", staging / "review.csv")
        (staging / "category-map.json").write_text(json.dumps(CATEGORY_MAP, indent=2) + "\n")
        (staging / "summary.json").write_text(json.dumps({
            "counts": dict(counts), "target_held_out_fraction": 0.2,
            "actual_held_out_fraction": counts["held_out"] / (counts["development"] + counts["held_out"]),
            "inventory_sha256": checksum(audit_dir / "inventory.json"),
            "review_sha256": checksum(audit_dir / "review.csv"),
            "negative_scope": list(SOURCE_CLASSES),
        }, indent=2) + "\n")
        staging.rename(output)
    print(json.dumps(dict(counts)))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: freeze_leftincar.py SOURCE AUDIT OUTPUT (new directory)")
    freeze(Path(sys.argv[1]).resolve(strict=True), Path(sys.argv[2]).resolve(strict=True), Path(sys.argv[3]).resolve())
