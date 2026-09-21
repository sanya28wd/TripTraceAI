# Phase 0 User Journey

This journey uses synthetic data only. A case represents one possible forgotten item and never proves ownership or promises a return.

| Step | Actor | Action | Status after | Automated | Human |
| --- | --- | --- | --- | --- | --- |
| 1. Upload | System | Receives an approved synthetic cabin frame for a completed trip. | No case yet | Accepts the staged input. | A team member approves the demo input. |
| 2. Privacy | System | Checks that the staged input is safe to process. | No case yet | Records the placeholder privacy result. | Operations handles a failed privacy check in a later phase. |
| 3. Detect | System | Finds one possible forgotten item. | `detected` | Creates one candidate per detected item. | No action unless the result is uncertain. |
| 4. Create case | System | Creates a synthetic case linked to the Trip ID. | `detected` | Adds the case and audit event. | No action. |
| 5. Alert driver | System, then driver | Sends only category, colour, and seat-area hints; the driver confirms when the item is secure. | `driver_alerted` → `secured` | Creates the alert. | The driver checks the vehicle and records the result. |
| 6. Submit claim | Passenger | Enters a Trip ID and a safe item description. A claim without a detection is routed for review. | `claim_submitted`, or `manual_review` when no detection exists | Links the claim to the trip's case when eligible. | The passenger supplies the claim. |
| 7. Compare | System | Produces a future structured comparison without making a handover decision. | `claim_submitted` or `clarification_needed` | Suggests a clarification or candidate match. | Operations reviews uncertain or sensitive cases. |
| 8. Candidate match | System or operations | Records that the claim and secured item may correspond. | `matched` | May propose the candidate match. | Operations confirms when required. |
| 9. Apply rules | System and operations | Routes sensitive, conflicting, or unsupported cases to a person. | `manual_review` when needed | Enforces routing rules. | Operations records an actor and note. |
| 10. Resolve | Operations | Records the outcome after the real-world process happens outside this prototype. | `closed` | Preserves the audit history. | Operations closes the case; the screen never promises a return. |

The Phase 0 clickable prototype begins at the passenger claim and driver alert steps. Upload, privacy processing, detection, comparison, and operations tooling remain documented placeholders.
