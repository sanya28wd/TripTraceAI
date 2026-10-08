"""Smoke-check dataset tooling with real local images and malformed annotations.

Run: uv run --project data python data/scripts/verify_dataset.py
"""

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

from audit_leftincar import SOURCE_CLASSES


SCRIPT_DIR: Path = Path(__file__).resolve().parent


def run_script(name: str, arguments: list[str], expected_success: bool) -> subprocess.CompletedProcess[str]:
    """Run an actual command and assert its exit status, including error context."""
    completed: subprocess.CompletedProcess[str] = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / name), *arguments], capture_output=True, text=True,
    )
    assert (completed.returncode == 0) == expected_success, completed.stdout + completed.stderr
    return completed


def verify() -> None:
    """Exercise image decoding, missing-label semantics and trust-boundary failures."""
    with tempfile.TemporaryDirectory() as directory:
        root: Path = Path(directory)
        source: Path = root / "source"
        (source / "images").mkdir(parents=True)
        (source / "labels").mkdir()
        (source / "data.yaml").write_text("names:\n" + "".join(f"- {name}\n" for name in SOURCE_CLASSES) + "nc: 10\n")
        stem: str = "image__0_2024-09-19_16-57-38"
        Image.new("RGB", (20, 20), "blue").save(source / "images" / f"{stem}.bmp")
        output: Path = root / "audit"
        run_script("audit_leftincar.py", [str(source), str(output)], True)
        records: list[dict[str, object]] = json.loads((output / "inventory.json").read_text())
        assert records[0]["label"] is None and records[0]["boxes"] == []
        run_script("audit_leftincar.py", [str(source), str(output)], False)
        run_script("review_leftincar.py", [str(source), str(output)], True)
        assert len(list((output / "visual").glob("sheet-*.jpg"))) == 1
        assert "pending" in (output / "review.csv").read_text()
        run_script("review_leftincar.py", [str(source), str(output)], False)
        label: Path = source / "labels" / f"{stem}.txt"
        for index, annotation in enumerate(("0 nan .5 .2 .2", "10 .5 .5 .2 .2", "0 .9 .5 .4 .2", "0 .5 .5 .2")):
            label.write_text(annotation)
            run_script("audit_leftincar.py", [str(source), str(root / f"invalid-{index}")], False)
        label.write_text("0 .5 .5 .2 .2\n")
        run_script("audit_leftincar.py", [str(source), str(root / "valid")], True)
        (source / "labels" / "orphan.txt").write_text("0 .5 .5 .2 .2")
        run_script("audit_leftincar.py", [str(source), str(root / "orphan")], False)
    verify_freeze()
    print("ok - audit, reviews, freeze gates, source integrity and approved development PNG export")


def write_reviews(path: Path, rows: list[dict[str, str]]) -> None:
    """Write explicit smoke-fixture review decisions."""
    with path.open("w", newline="") as stream:
        writer: csv.DictWriter[str] = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def verify_freeze() -> None:
    """Exercise the audit-to-freeze-to-PNG path and its refusal cases."""
    with tempfile.TemporaryDirectory() as directory:
        root: Path = Path(directory)
        source: Path = root / "source"
        (source / "images").mkdir(parents=True)
        (source / "labels").mkdir()
        (source / "data.yaml").write_text("names:\n" + "".join(f"- {name}\n" for name in SOURCE_CLASSES) + "nc: 10\n")
        for index, color in enumerate(("blue", "green", "red", "yellow", "white", "black", "pink", "orange", "purple", "gray")):
            stem: str = f"image__{index}_2024-09-19_16-57-3{index}"
            Image.new("RGB", (30, 20), color).save(source / "images" / f"{stem}.bmp")
            if index % 2 == 0:
                (source / "labels" / f"{stem}.txt").write_text("0 .5 .5 .2 .2\n")
        audit_dir: Path = root / "audit"
        run_script("audit_leftincar.py", [str(source), str(audit_dir)], True)
        run_script("review_leftincar.py", [str(source), str(audit_dir)], True)
        arguments: list[str] = [str(source), str(audit_dir), str(root / "frozen")]
        rejected: subprocess.CompletedProcess[str] = run_script("freeze_leftincar.py", arguments, False)
        assert "Unfinished review" in rejected.stderr
        with (audit_dir / "review.csv").open(newline="") as stream:
            rows: list[dict[str, str]] = list(csv.DictReader(stream))
        for index, row in enumerate(rows):
            row.update(decision="accept" if index % 2 == 0 else "no_item",
                       group="a" if index < 8 else "b", split="development" if index < 8 else "held_out",
                       privacy="approved" if index == 0 else "not_approved", reviewer="fixture", note="Synthetic smoke fixture")
        write_reviews(audit_dir / "review.csv", rows)
        run_script("freeze_leftincar.py", arguments, True)
        run_script("freeze_leftincar.py", arguments, False)
        frozen: Path = root / "frozen"
        assert len(json.loads((frozen / "development.json").read_text())) == 8
        assert len(list((frozen / "labels").glob("*.txt"))) == 10
        assert sum(p.read_text() == "" for p in (frozen / "labels").glob("*.txt")) == 5
        run_script("export_demo.py", [str(source), str(frozen), rows[0]["image"], str(root / "demo")], True)
        for index in (1, 8):
            run_script("export_demo.py", [str(source), str(frozen), rows[index]["image"], str(root / f"blocked-{index}")], False)
        wrong_ratio: list[dict[str, str]] = [{**row, "group": str(index),
            "split": "development" if index < 6 else "held_out"} for index, row in enumerate(rows)]
        write_reviews(audit_dir / "review.csv", wrong_ratio)
        rejected = run_script("freeze_leftincar.py", [*arguments[:2], str(root / "ratio")], False)
        assert "fraction" in rejected.stderr
        crossed: list[dict[str, str]] = [{**row, "group": "shared"} for row in rows]
        write_reviews(audit_dir / "review.csv", crossed)
        rejected = run_script("freeze_leftincar.py", [*arguments[:2], str(root / "crossed")], False)
        assert "crosses" in rejected.stderr
        write_reviews(audit_dir / "review.csv", rows)
        inventory: Path = audit_dir / "inventory.json"
        records: list[dict[str, object]] = json.loads(inventory.read_text())
        records[8]["sha256"] = records[0]["sha256"]
        inventory.write_text(json.dumps(records))
        rejected = run_script("freeze_leftincar.py", [*arguments[:2], str(root / "duplicate")], False)
        assert "crosses" in rejected.stderr
        records[8]["sha256"] = "changed"
        inventory.write_text(json.dumps(records))
        rejected = run_script("freeze_leftincar.py", [*arguments[:2], str(root / "stale")], False)
        assert "changed" in rejected.stderr
        (source / "data.yaml").write_text("names:\n- changed\nnc: 10\n")
        run_script("audit_leftincar.py", [str(source), str(root / "wrong-classes")], False)


if __name__ == "__main__":
    verify()
