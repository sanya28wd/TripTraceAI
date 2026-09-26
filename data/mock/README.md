# Mock Data

This folder contains **15 synthetic mock cases** for testing the TripTrace AI passenger-claim and driver-response workflow.

All cases use synthetic Trip IDs and contain no real passenger or customer information.

### What these 15 cases cover

| Cases         | Claim Category / Purpose                 |
| ------------- | ---------------------------------------- |
| 001, 006, 014 | Normal successful flows                  |
| 002, 007, 008 | Clarification needed                     |
| 003, 011      | Sensitive-item claims                    |
| 004           | Claim without detection                  |
| 005, 009, 010 | Possible / successful matches            |
| 012           | Low-confidence claim                     |
| 013           | **No-item case**                         |
| 015           | Conflicting claim and detection evidence |

| Cases                                       | English / Arabic                         |
| ------------------------------------------- | ---------------------------------------- |
| 001, 003, 004, 012, 013, 015                | English                                  |
| 002, 005, 006, 007, 008, 009, 010, 011, 014 | Arabic                                   |


### Case Categories

* **Normal successful flows:** Clear passenger claims with corresponding detected items.
* **Clarification:** The claim does not contain enough information for a reliable match, so additional details are required.
* **Sensitive items:** Claims involving potentially sensitive items. These require manual review and must not be automatically resolved.
* **Claim without detection:** A passenger reports an item, but no corresponding detected item is available.
* **Possible / successful matches:** Claims containing attributes that can be compared against detected-item evidence.
* **Low confidence:** The available evidence or claim information has insufficient confidence for automatic resolution.
* **No-item case:** The driver/system reports that no item was detected or found.
* **Conflicting evidence:** Passenger claim attributes conflict with the available detected-item evidence and require manual review.

### Important Notes

* `sensitive: true` cases are intended to test the manual-review path.
* Cases with `noItem: true` are intended to test the no-item workflow.
* Uncertain or incomplete claims are used to test the `clarification_needed` path.
* Conflicting or low-confidence cases are used to test `manual_review`.
* A matching result does **not** establish ownership; physical ownership and handover remain human decisions.
* These cases are **mock application data**, not staged image data. They should not be treated as the held-out evaluation dataset.
* Driver actions should only be tested on cases that have reached the appropriate driver-facing workflow state, such as `driver_alerted`.
