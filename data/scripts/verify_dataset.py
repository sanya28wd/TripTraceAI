"""Smoke-check dataset tooling with real local images and malformed annotations.

Run: uv run --project data python data/scripts/verify_dataset.py
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


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
    print("ok - real BMP audit, missing labels, malformed boxes, orphans and overwrite rejection")


if __name__ == "__main__":
    verify()
