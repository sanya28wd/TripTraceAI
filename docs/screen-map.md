# Phase 0 Screen Map

```mermaid
flowchart LR
    Start[Choose a role]
    Start --> P1[Passenger: enter Trip ID]
    P1 --> P2[Passenger: claim form]
    P2 --> P3[Passenger: status]
    P3 --> P4[Passenger: clarification]
    P3 --> P5[Passenger: manual-review message]
    Start --> D1[Driver: alert]
    D1 --> D2[Driver: confirm secure]
    D1 --> D3[Driver: report no item]
    D1 --> D4[Driver: ask operations]
    D3 -. later phase .-> O1[Operations: review queue]
    D4 -. later phase .-> O1
    P5 -. later phase .-> O1
```

## Data boundaries

| Screen | Reads | Safe display | Never displays |
| --- | --- | --- | --- |
| Role choice | None | Passenger and driver links | Case data |
| Passenger Trip ID | `tripId` | Synthetic Trip ID input | Cabin imagery, passenger identity, detected-item details |
| Passenger claim | `tripId` | Description, category, colour | Cabin imagery, another claim, identity data |
| Passenger status | `caseId`, `tripId`, `status`, `manualReviewReason` | Friendly status and next step | Internal confidence, bounding boxes, driver identity, entitlement language |
| Passenger clarification | `caseId`, `status`, `passengerClaim` | A request for safe descriptive detail | Detected-item evidence or comparison score |
| Passenger manual review | `caseId`, `status` | A neutral review message | Internal reason codes, staff notes, outcome promises |
| Driver alert | `caseId`, `status`, safe `detectedItem` fields | Category, colour, seat-area hint | Cabin imagery, passenger claim, passenger identity, confidence, bounding box |
| Driver action result | `caseId`, `status`, `auditTimeline`, `manualReviewReason` | Resulting status and new safe audit event | Passenger identity or claim description |
| Operations review queue | Future safe case summary | Not implemented in Phase 0 | Raw or unredacted material by default |

The static passenger and driver pages use separate in-memory copies of the mock records. They demonstrate the agreed journey; they do not synchronize state or call the API.
