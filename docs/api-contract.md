# TripTrace AI API Contract Phase 0

This is the first shared contract for mock screens and future services. Only `GET /health` is implemented in Phase 0. The other endpoints define agreed request and response shapes; they are not implemented yet.

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
