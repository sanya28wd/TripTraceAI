# Staged Data Plan

## Purpose

The staged-data plan defines what data TripTrace AI will use during development, AI testing, integration, and final evaluation. Data will be introduced progressively so that the team can build and test the system without depending on real passenger or driver information.

---

## Stage 1 — Synthetic Development Data

**Purpose:** Build and test the basic passenger, driver, and case workflows using completely synthetic data created by the team.

### Data Included

- Synthetic Trip IDs
- Synthetic Case IDs
- Example lost-item descriptions
- Item categories and attributes
- Synthetic timestamps
- Synthetic pickup/drop-off locations
- Synthetic driver IDs
- Synthetic passenger IDs
- Placeholder item images

### Example

| **Field** | **Example** |
|---|---|
| Case ID | `CASE-001` |
| Trip ID | `TRIP-001` |
| Item category | Electronics |
| Item type | Smartphone |
| Color | Black |
| Status | Claim submitted |
| Image | `phone_001.jpg` |

> **Privacy requirement:** No real names, phone numbers, addresses, license plates, faces, or other personally identifiable information (PII) should be used.

---

## Stage 2 — AI Component Testing Data

**Purpose:** Test the computer-vision and multimodal components independently before full system integration.

The team will use publicly available datasets and/or controlled images representing common lost-item categories.

### Data May Include

- Smartphones
- Bags and backpacks
- Wallets
- Keys
- Laptops/tablets
- Clothing
- Other common personal belongings

Each image should have an associated ground-truth label where possible.

### Required Labels

- Item category
- Item type/subcategory
- Relevant visual attributes
- Ground-truth object presence
- Image ID

The dataset will be used to evaluate object detection, classification, and visual matching performance.

---

## Stage 3 — Controlled End-to-End Test Set

**Purpose:** Test the complete TripTrace AI workflow using cases whose expected outcomes are already known.

The team will create a controlled set of simulated lost-property cases.

Each case will contain:

- Case ID
- Trip ID
- Item information
- Passenger claim
- Driver-side information
- One or more item images
- Expected matching outcome
- Expected case-status transitions

### Example Outcomes

- Correct match
- No match
- Multiple possible matches
- Insufficient visual evidence
- Manual review required

This stage allows the team to test whether the system correctly moves a case through the agreed workflow.

---

## Stage 4 — Responsible-AI Evaluation Data

**Purpose:** Evaluate privacy, robustness, hallucination, and other Responsible-AI requirements.

The evaluation set will contain deliberately designed test cases covering both normal and difficult scenarios.

### Example Tests

| **Test Type** | **Example** |
|---|---|
| Privacy | Image contains an identifiable face |
| Privacy | Image contains a license plate |
| Ambiguity | Two visually similar bags |
| Low quality | Blurry or poorly lit image |
| Occlusion | Item is partially hidden |
| No match | Driver image does not contain the claimed item |
| Multiple match | Several visually similar objects |
| Insufficient evidence | Image is too unclear to make a reliable match |

The expected behaviour for each test will be defined before evaluation.

---

## Stage 5 — Final Held-Out Evaluation Set

**Purpose:** Produce the final project evaluation results.

A separate test set will be kept out of model development and tuning.

The final evaluation will measure the agreed system-level metrics, such as:

- Item detection/classification performance
- Matching performance
- False matches and missed matches
- Manual-review rate
- Privacy-test performance
- Appropriate handling of uncertain cases

> **Evaluation rule:** The final test data must not be used to tune the system after evaluation begins.

---

# Data Governance Rules

Across all stages:

1. **Use synthetic data whenever real personal data is not necessary.**
2. **Do not place real passenger or driver information in the GitHub repository.**
3. **Keep personally identifiable information out of model-training and testing data wherever possible.**
4. **Record the source and purpose of each dataset.**
5. **Maintain consistent item labels using the shared item taxonomy.**
6. **Keep final evaluation data separate from development data.**
7. **Document expected outcomes for controlled evaluation cases.**
8. **Apply privacy redaction to images before they are stored or processed where required.**
