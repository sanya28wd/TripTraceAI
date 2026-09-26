# Data Directory

This directory contains the staged and synthetic data used for developing and evaluating TripTrace AI.

All data used by the MVP must be **consented, staged, or synthetic**. Real passenger data, real personal information, and unapproved images must not be added to this directory.

## Directory Structure

```text
data/
├── development/
├── held_out/
├── labels/
└── staged/
```

### `development/`

Contains the images used during model development and experimentation.

Use this split for:

* Detector and VLM experiments
* Privacy-redaction development
* Error analysis
* Model testing and iteration

Development data may be used repeatedly during development.

---

### `held_out/`

Contains the **frozen evaluation set** that is not used for model development or tuning.

Use this split for final evaluation of:

* Privacy redaction
* Item detection
* Matching
* Bilingual consistency
* Unsafe-output and safety tests

The held-out set should remain unchanged after it is frozen. Do not use these images for model tuning or development.

---

### `labels/`

Contains the metadata and label files associated with the staged dataset.

Labels should support the shared item taxonomy and evaluation requirements, including information such as:

* Item category
* Bounding boxes, where applicable
* Sensitive-region annotations
* No-item cases
* Expected privacy/redaction regions
* Evaluation-case information

The label files should not contain real personally identifiable information.

---

### `staged/`

Contains approved staged images used by the TripTrace AI MVP.

Images should be:

* Consent-based or synthetic
* Representative of intended taxi-cabin scenarios
* Safe for development and demonstration
* Free from real passenger personal information

Example scenarios include:

* Visible lost items
* Partially hidden items
* No-item images
* Privacy test images containing dummy faces, documents, screens, or plates
* Sensitive-item scenarios using mock items

Images containing sensitive regions are used to verify that privacy redaction occurs **before storage and downstream processing**.

## Data Rules

1. **Never add real passenger/customer data.**
2. Use only approved staged or synthetic images.
3. Do not store unredacted production-style personal data.
4. Keep `held_out/` separate from development data.
5. Do not modify the held-out evaluation set after it is frozen.
6. Keep labels consistent with the shared item taxonomy.
7. Record dataset changes when images or labels are added or removed.
8. Do not commit images containing real personal data to Git.

## Dataset Split

The intended workflow is:

```text
staged/
   │
   ├── development/  → model development and experimentation
   │
   └── held_out/     → final evaluation only
```

The held-out set is reserved for the final evaluation and should remain untouched during development.

The final project evaluation should cover privacy redaction, detection, matching, bilingual consistency, and safety/unsafe-output tests.
