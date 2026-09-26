# TripTrace AI API Contract Phase 1

This is the shared contract for mock screens and future services. Phase 1 implements only the health check and scripted mock passenger endpoints. The earlier case endpoints remain the shared design for later phases and are not implemented yet.

All request and response bodies are JSON. IDs are synthetic. Timestamps use ISO 8601 UTC, for example `2026-09-21T09:15:00Z`.

## Status values

The status must be exactly one of: `detected`, `claim_submitted`, `clarification_needed`, `matched`, `driver_alerted`, `secured`, `manual_review`, or `closed`.

## Endpoints

### GET /health

Checks whether the minimal local API is running.

Response: `200 OK`

```json
{"status":"ok"}
```

### POST /v1/trips

Creates a synthetic Trip ID for demos and mock screens.

Response: `201 Created`

```json
{
  "tripId": "trip_demo_001",
  "createdAt": "2026-09-21T09:15:00Z"
}
```

### POST /v1/cases

Creates a placeholder lost-property case. In Phase 0, frontends may mock this response locally.

Required request fields: `tripId`, `sourceType`. Optional placeholder fields: `detectedItem`, `passengerClaim`.

Response: `201 Created` with the complete case record.

### GET /v1/cases/{caseId}

Retrieves one case record by its `caseId`.

Response: `200 OK` with the complete case record, or `404 Not Found` when it does not exist.

### POST /v1/cases/{caseId}/events

Records a status change or audit event. The event has `eventType`, `occurredAt`, `actorType`, and optional `status`, `note`, and `details`.

Response: `201 Created` with the recorded event and the updated case record.

For full field definitions and examples, see [case-schema.md](case-schema.md) and [openapi.yaml](openapi.yaml).

## Phase 1 implemented mock endpoints

These endpoints use only the synthetic records in `api/mock-data/cases.json`. Their item categories and colour values follow Student B's shared files in `data/labels/`. They do not call an AI model, inspect an image, save a real database record, or decide ownership.

### GET /v1/mock/cases/{tripId}

Returns the scripted case that Student A can display in the passenger prototype.

Supported Trip IDs:

| Trip ID | UI outcome | Status |
| --- | --- | --- |
| `TRIP-1001` | Safe recorded-claim status | `claim_submitted` |
| `TRIP-1002` | Clarification question | `clarification_needed` |
| `TRIP-1003` | Arabic sensitive-item manual review | `manual_review` |
| `TRIP-9999` | Safe not-found response | `404` |

Example request:

```bash
curl http://localhost:8000/v1/mock/cases/TRIP-1002
```

Example response:

```json
{
  "tripId": "TRIP-1002",
  "caseId": "CASE-MOCK-1002",
  "status": "clarification_needed",
  "responseType": "clarification",
  "safePassengerMessage": "We found a possible item matching your description. Please confirm one detail.",
  "clarificationQuestion": "Can you confirm whether your item was dark coloured and approximately palm-sized?"
}
```

### POST /v1/mock/claims

Accepts a mock claim submission and returns the scripted safe response for its Trip ID. The optional `description` and `language` fields exist for UI testing only; they do not change the scripted decision.

Example request:

```bash
curl -X POST http://localhost:8000/v1/mock/claims \
  -H "Content-Type: application/json" \
  -d '{"tripId":"TRIP-1002","description":"I lost a dark wallet","language":"en"}'
```

Expected status codes:

| Status | Meaning for the passenger UI |
| --- | --- |
| `200` | Render `safePassengerMessage`, and optionally `clarificationQuestion` or manual-review content. |
| `400` | The UI did not send a valid JSON body with a `tripId`. Show a generic retry message. |
| `404` | Use `safePassengerMessage`; do not expose implementation details. |

## Student A integration notes

Use `GET /v1/mock/cases/{tripId}` when loading a demo case and `POST /v1/mock/claims` after the passenger submits the form. Render only `safePassengerMessage`, `clarificationQuestion`, `manualReviewReason`, and safe claim attributes. Do not show the audit timeline as customer-facing evidence. Treat `responseType` as the UI state selector: `safe_status`, `clarification`, or `manual_review`.

## Replacement in later phases

Phase 3 replaces the JSON file with persistent case storage. Phase 4 adds privacy filtering and structured detector evidence. Phase 6 adds VLM descriptions and LLM claim parsing, but both must return validated structured fields. Phase 7 adds matching and deterministic rules. The passenger UI can retain this response shape while the data source changes.
