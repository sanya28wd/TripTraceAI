# LeftInCAR v1 — person B handoff

The frozen artifact is `leftincar-v1/`: development and held-out manifests,
excluded manifest, per-image review decisions, original numeric YOLO labels,
category mapping and checksum summary. Raw images and review previews remain
outside Git. Source: [LeftInCAR v1](https://data.mendeley.com/datasets/dd4hw3r6dh/1),
DOI 10.17632/dd4hw3r6dh.1, by Ana Santos and collaborators, CC BY 4.0.
This handoff derives annotations/manifests and a metadata-stripped PNG; source
BMP files and source annotations are unchanged.

## Decisions and boundaries

- All 971 BMPs decode; 934 source annotation files contain 4,076 valid boxes.
  There are no orphan annotations or exact duplicate image hashes.
- All 971 images received chronological contact-sheet visual review. This
  detects gross discrepancies; tiny-object semantics and every box edge are
  not independently certified at full resolution.
- 803 images are included: 648 development, 155 held-out (19.3%). Seven capture
  groups are inferred from filename timestamps separated by more than ten
  minutes. Group 6 is held out in full. Groups and exact byte duplicates cannot
  cross splits. Both splits contain all nine accepted source classes and
  verified source negatives. The freeze guard permits 15–25% held-out around
  the 20% target to accommodate whole capture groups.
- Exclude 149 images containing unresolved `card` annotations, 16 additional
  active-display frames requiring closer privacy review, and three ambiguous
  book-containing source negatives. These conservative exclusions can be
  reconsidered in a separately reviewed dataset version.
- Preserve original YOLO classes and coordinates. `category-map.json` maps
  source names separately to the canonical TripTrace taxonomy; `card` remains
  unresolved (`null`), never guessed to be an ID or bank card. Sensitivity is
  determined by the canonical taxonomy, not the source dataset table.
- The 34 accepted unannotated images receive empty derived labels. Their
  `no_item` decision means absence of the ten source target classes, not absence
  of every possible lost object. Some out-of-taxonomy objects remain visible.
- Label acceptance is separate from upload approval. Only development image
  `images/image__104_2024-09-19_15-31-42.bmp` is approved for the local checkpoint:
  individual preview inspection shows clothing, dark screens and no visible
  faces, cards or private text. Every other image remains `not_approved` for
  raw upload. Public availability alone does not establish privacy safety.
- Capture-group separation does not prove separation of vehicles, physical
  items or backgrounds. Reused cabin/props limit generalization claims.
- Pillow exposes only compression/dpi metadata in these BMPs. This is not a
  forensic privacy certification. Export reconstructs RGB pixels without
  embedded metadata, preserves pixel values and requires PNG size <= 5 MiB.
- No API contract, backend, UI, model training or redaction behavior changes.
  C owns storage/API; A owns UI. The API stores uploaded image bytes unchanged.

## Use and verification

Run commands from the repository root. Source is the existing local
`/Users/tacticalcamel/Downloads/leftincar-data` directory.

```sh
uv run --project data python data/scripts/verify_dataset.py
uv run --project data python data/scripts/export_demo.py /Users/tacticalcamel/Downloads/leftincar-data data/labels/leftincar-v1 images/image__104_2024-09-19_15-31-42.bmp data/review/leftincar/demo
```

Export requires a new output directory; the existing local demo is already
exported. Audit, review and freeze CLI usage is documented in their module
docstrings. Review output starts pending; freezing rejects unfinished reviews,
unresolved mappings, stale source bytes, leakage and invalid split allocation.
Freeze never overwrites an existing artifact directory. Per-image paths and
hashes in all three manifests cover the full audited input.

Dataset CLI smoke checks pass, including invalid annotations, pending review,
leakage, incorrect ratio, stale source, overwrite refusal and restricted export.
`npm run verify:real` in `api/` passes. A temporary copy of that existing verifier
with only its staged image path replaced by the exported PNG also passes:
3,330,426 bytes upload/download intact, matching SHA-256, timeline and storage
survive server restart. Both use isolated temporary storage, removed afterward.
No deployment or production data was touched.

`npm run verify` in `api/` fails at the passenger driver-alert state check;
`node web/smoke-test.js` fails at line 21. Both fail identically in a fresh archive
of baseline main `0c3db05bc222eedcd136feced39ead88150a6384`. These existing A/C
issues remain outside this change. Independent code review identified the
missing ratio guard; the guard and a rejection smoke check are now present.
