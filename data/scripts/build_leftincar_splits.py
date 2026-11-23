"""Build a card-aware development split from the frozen LeftInCAR v1 release.

Run: uv run --project data python data/scripts/build_leftincar_splits.py SOURCE REVIEW MANIFESTS LOCAL
REVIEW is the completed card review CSV. MANIFESTS and LOCAL are new directories.
The frozen v1 holdout is used only for membership and leakage checks.
"""

import csv
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import TypedDict, cast

from audit_leftincar import ImageRecord, SOURCE_CLASSES, checksum, read_boxes, validate_source_classes
from freeze_leftincar import Review

FROZEN = Path(__file__).resolve().parents[1] / "labels" / "leftincar-v1"
CARD_CLASS_ID = SOURCE_CLASSES.index("card")
VALIDATION_GROUPS = frozenset({"capture-session-03", "capture-session-04"})
TEST_GROUPS = frozenset({"capture-session-06"})


class FrozenRow(TypedDict):
    source: ImageRecord
    review: Review


class SplitRow(TypedDict):
    image: str
    sha256: str
    capture_session: str
    label: str
    label_sha256: str


def frozen_rows(name: str) -> list[FrozenRow]:
    return cast(list[FrozenRow], json.loads((FROZEN / f"{name}.json").read_text()))


def accepted_cards(path: Path, candidates: list[FrozenRow]) -> list[FrozenRow]:
    expected: set[str] = {row["source"]["image"] for row in candidates}
    decisions: dict[str, str] = {}
    with path.open(newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["image", "decision", "reason"]:
            raise ValueError(f"{path}: expected image, decision, reason columns")
        for row in reader:
            name, decision, reason = row["image"], row["decision"], row["reason"]
            if (None in row or name not in expected or name in decisions or
                    decision not in {"accept", "exclude"} or not reason or not reason.strip()):
                raise ValueError(f"{path}:{reader.line_num}: invalid card review row for {name}")
            decisions[name] = decision
    if missing := expected - decisions.keys():
        raise ValueError(f"{path}: missing card reviews for {', '.join(sorted(missing))}")
    return [row for row in candidates if decisions[row["source"]["image"]] == "accept"]


def verify_partitions(partitions: dict[str, list[FrozenRow]]) -> None:
    seen_images: set[str] = set()
    seen_hashes: set[str] = set()
    seen_groups: set[str] = set()
    for name, rows in partitions.items():
        images: set[str] = {row["source"]["image"] for row in rows}
        hashes: set[str] = {row["source"]["sha256"] for row in rows}
        groups: set[str] = {row["review"]["group"] for row in rows}
        if len(rows) != len(images) or images & seen_images or hashes & seen_hashes or groups & seen_groups:
            raise ValueError(f"{name}: found duplicate image or cross-split image, SHA-256, or capture session")
        classes: set[int] = {box["class_id"] for row in rows for box in row["source"]["boxes"]}
        if not (set(range(len(SOURCE_CLASSES))) - {CARD_CLASS_ID}) <= classes:
            raise ValueError(f"{name}: missing coverage for an original accepted class")
        if not any(row["review"]["decision"] == "no_item" for row in rows):
            raise ValueError(f"{name}: missing source negatives")
        seen_images.update(images)
        seen_hashes.update(hashes)
        seen_groups.update(groups)


def materialize_row(source: Path, output: Path, split: str, row: FrozenRow) -> SplitRow:
    record: ImageRecord = row["source"]
    image_name: str = Path(record["image"]).name
    label_name: str = f"{Path(image_name).stem}.txt"
    image_relative: str = f"images/{split}/{image_name}"
    label_relative: str = f"labels/{split}/{label_name}"
    label_source: Path = FROZEN / "labels" / label_name
    if row["review"]["decision"] == "exclude":
        label: str | None = record["label"]
        if label is None:
            raise ValueError(f"{image_name}: approved card image has no source annotation")
        label_source = source / label

    shutil.copyfile(source / record["image"], output / image_relative)
    if checksum(output / image_relative) != record["sha256"]:
        raise ValueError(f"{record['image']}: copied image SHA-256 differs from LeftInCAR v1")
    shutil.copyfile(label_source, output / label_relative)
    label_hash: str = checksum(output / label_relative)
    if (read_boxes(output / label_relative) != record["boxes"] or
            (record["label_sha256"] is not None and label_hash != record["label_sha256"])):
        raise ValueError(f"{label_source}: copied YOLO label differs from LeftInCAR v1")
    return SplitRow(image=record["image"], sha256=record["sha256"], capture_session=row["review"]["group"],
                    label=label_relative, label_sha256=label_hash)


def publish(source: Path, review: Path, manifests: Path, local: Path) -> None:
    for path in (manifests, local):
        if path.exists() or path.is_symlink():
            raise FileExistsError(f"Output already exists: {path}; choose a new directory")
    if manifests == local or manifests in local.parents or local in manifests.parents:
        raise ValueError("Manifest and local output must be separate directories")
    validate_source_classes(source)
    holdout: list[FrozenRow] = frozen_rows("held_out")
    if {row["review"]["group"] for row in holdout} != TEST_GROUPS:
        raise ValueError("Frozen holdout capture session differs from the LeftInCAR v1 handoff")
    candidates: list[FrozenRow] = [
        row for row in frozen_rows("excluded") if row["review"]["group"] not in TEST_GROUPS
        and any(box["class_id"] == CARD_CLASS_ID for box in row["source"]["boxes"])
    ]
    development: list[FrozenRow] = frozen_rows("development") + accepted_cards(review, candidates)
    train: list[FrozenRow] = [row for row in development if row["review"]["group"] not in VALIDATION_GROUPS]
    validation: list[FrozenRow] = [row for row in development if row["review"]["group"] in VALIDATION_GROUPS]
    verify_partitions({"train": train, "validation": validation, "held_out": holdout})

    manifests.parent.mkdir(parents=True, exist_ok=True)
    local.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=manifests.parent) as metadata, tempfile.TemporaryDirectory(dir=local.parent) as copies:
        staged_manifests: Path = Path(metadata) / "manifests"
        staged_local: Path = Path(copies) / "local"
        staged_manifests.mkdir()
        category_map = cast(dict[str, str | None], json.loads((FROZEN / "category-map.json").read_text()))
        category_map["card"] = "card"
        (staged_manifests / "category-map.json").write_text(json.dumps(category_map, indent=2) + "\n")
        for name, folder, rows in (("train", "train", train), ("validation", "val", validation)):
            (staged_local / "images" / folder).mkdir(parents=True)
            (staged_local / "labels" / folder).mkdir(parents=True)
            entries: list[SplitRow] = [materialize_row(source, staged_local, folder, row)
                                       for row in sorted(rows, key=lambda item: item["source"]["image"])]
            (staged_manifests / f"{name}.json").write_text(json.dumps(entries, indent=2) + "\n")
        staged_manifests.rename(manifests)
        try:
            staged_local.rename(local)
        except OSError:
            manifests.rename(staged_manifests)
            raise

    for name, rows in (("train", train), ("validation", validation)):
        cards: int = sum(any(box["class_id"] == CARD_CLASS_ID for box in row["source"]["boxes"]) for row in rows)
        print(f"{name}: {len(rows)} images, {cards} with card annotations")
        if not cards:
            print(f"WARNING: {name} has no approved card examples", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit("Usage: build_leftincar_splits.py SOURCE REVIEW MANIFESTS LOCAL (new output directories)")
    publish(Path(sys.argv[1]).resolve(strict=True), Path(sys.argv[2]).resolve(strict=True),
            Path(sys.argv[3]).absolute(), Path(sys.argv[4]).absolute())
