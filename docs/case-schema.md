# TripTrace AI Case Record Phase 0

A case is the shared record for one possible forgotten item. It is designed for synthetic demos now and will grow only through team agreement. It never proves who owns an item or authorizes a handover.

## Core fields

| Field | Plain-language meaning | Phase 0 state |
| --- | --- | --- |
| `tripId` | A synthetic ID that links a demo trip to a case. | Stable |
| `caseId` | The unique ID for this case. | Stable |
| `status` | The current shared case status. | Stable |
| `createdAt`, `updatedAt` | When the case was created and last changed, in UTC. | Stable |
| `sourceType` | How the case began: `detection`, `passenger_claim`, or `manual_entry`. | Stable |
| `privacy` | Whether redaction has not started, is pending, passed, failed, or is not applicable. | Placeholder for later privacy processing |

## Detected item placeholder

`detectedItem` is reserved for future detection results. It can include `category`, `colour`, `seatAreaHint`, `confidence`, `boundingBox`, `noItem`, and `modelVersion`. Every field in this object is a placeholder for later phases. Do not create real detection results in Phase 0.

## Passenger claim placeholder

`passengerClaim` is reserved for the passenger’s future claim. It can include `description`, `category`, `colour`, `sizeHint`, `language`, and `sensitive`. Every field in this object is a placeholder for later phases. Do not collect real passenger details in Phase 0.

## Audit timeline

`auditTimeline` is a chronological list of events. Each event records an `eventId`, `eventType`, `occurredAt`, `actorType`, optional resulting `status`, optional safe `note`, and optional structured `details`. The timeline is stable because the team needs an auditable history from the start.

## Manual review

`manualReviewReason` explains why a case needs human attention. It is optional and should be present when the status is `manual_review`. It is a placeholder for the later review workflow, but its field name should remain stable.

## Privacy rules for examples and future data

Use synthetic IDs and fake text only. Do not put real names, phone numbers, license plates, taxi records, raw images, or unredacted personal data into a case record, example, label, or commit.
