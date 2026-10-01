# Phase 2 Mock API Contract

The API holds synthetic cases and driver alerts in memory. Restarting the API resets the demo. It has one fixed session: `DRIVER-MOCK-001` in `VEHICLE-MOCK-204`.

## Passenger endpoints

### `GET /v1/mock/cases/{tripId}`

Returns the passenger-safe case projection: `tripId`, `caseId`, `status`, `language`, `responseType`, `safePassengerMessage`, and `clarificationQuestion`.

It never returns a driver alert, assignment, item image, image URL, detector result, confidence, bounding box, audit history, internal review reason, or passenger claim content.

### `POST /v1/mock/claims`

Accepts `{ "tripId": "TRIP-1001" }`. The scripted `TRIP-1001` report records `claim_submitted`, moves the case to `driver_alerted`, and creates one alert when safe evidence is available. Its passenger response remains neutral.

If no privacy-approved safe crop is available, the case moves to `manual_review` with internal reason `driver_alert_evidence_unavailable`; no driver alert is created.

## Driver endpoints

### `GET /v1/mock/driver/session`

Returns the fixed demo driver and vehicle summary.

### `GET /v1/mock/driver/alerts`

Returns alerts assigned to the fixed session, newest first. Each alert contains:

- `alertId`, `caseId`, `tripId`, timestamps, `readAt`, `alertStatus`, and `caseStatus`
- one approved `detectedItem`: `category`, `colour`, `seatAreaHint`, `imageUrl`, and `imageAlt`
- `allowedActions` and an action `outcomeMessage` after completion

The response excludes passenger claim wording and identity, detector confidence, bounding boxes, model data, raw imagery, alternative items, and assignment identifiers.

### `GET /v1/mock/driver/alerts/{alertId}`

Returns one assigned driver-safe alert. Reading this endpoint does not change its read state.

### `POST /v1/mock/driver/alerts/{alertId}/read`

Records `readAt` and moves a new alert to `in_progress`.

### `POST /v1/mock/driver/alerts/{alertId}/actions`

Accepts one of:

```json
{ "action": "secure" }
```

| Action | Case result | Audit event | Driver confirmation |
| --- | --- | --- | --- |
| `secure` | `secured` | `item_secured` | Item secured; operations provides next steps. |
| `no_item` | `manual_review` | `manual_review_requested` with `driver_reported_no_item` | Operations has been asked to review. |
| `ask_operations` | `manual_review` | `manual_review_requested` with `driver_requested_help` | Help request recorded. |

The first action completes the alert and removes all allowed actions. Repeated actions return `409`. The API also rejects alerts outside `driver_alerted` or missing privacy-approved evidence.

## Safety and scope

The crop at `/assets/mock/black-bag-safe-crop.png` is a committed synthetic retrieval asset. The fixture never contains raw cabin imagery. A possible-item association is a demo trigger; it does not determine ownership or authorize a passenger handover.

This phase has no real authentication, persistence, WebSockets, device push notifications, operations dashboard, or live object detection.
